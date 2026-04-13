import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runPipeline } from '../../../src/pipeline/pipeline';
import type { PipelineDeps } from '../../../src/pipeline/pipeline';
import type { ParsedOCRResult, ImageBuffer } from '../../../src/types/ocr';
import type { LookupResult } from '../../../src/types/lookup';
import type { PipelineTrigger } from '../../../src/types/pipeline';
import {
  DEFAULT_RAID_CONFIG,
  DEFAULT_SCORER_CONFIG,
} from '../../../src/config/defaults';

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────

const DUMMY_BUFFER: ImageBuffer = {
  data: Buffer.from(''),
  width: 1,
  height: 1,
  format: 'png',
};

const TRIGGER: PipelineTrigger = {
  source: 'manual',
  region: { x: 0, y: 0, width: 100, height: 50 },
  triggeredAt: new Date(),
};

function makeOcrResult(overrides?: Partial<ParsedOCRResult>): ParsedOCRResult {
  return {
    name: '테스트',
    jobName: null,
    renown: 100_001,  // makeOkLookupResult의 renown(100_000)과 근사 → fameScore=1.0 → disambiguator 통과
    confidence: 0.9,
    rawLines: [],
    warnings: [],
    needsManualReview: false,
    ...overrides,
  };
}

function makeOkLookupResult(name = '테스트'): LookupResult {
  return {
    status: 'ok',
    data: [
      {
        name,
        server: '카인',
        jobName: '眞 넨마스터',
        adventureName: null,
        renown: 100_000,
        stats: { type: 'damage', primaryValue: 1_000_000_000, displayLabel: '10억' },
        visual: { fullBodyImageUrl: null, jobIconUrl: null },
        fetchedAt: new Date(),
      },
    ],
  };
}

function makeFailedLookupResult(
  reason: Extract<LookupResult, { status: 'failed' }>['reason'],
): LookupResult {
  return { status: 'failed', name: '테스트', reason, attemptedAt: new Date() };
}

/** 기본 "정상 경로" deps. 각 테스트에서 필요한 부분만 override한다. */
function makeDeps(overrides?: Partial<PipelineDeps>): PipelineDeps {
  return {
    capture: vi.fn().mockResolvedValue(DUMMY_BUFFER),
    preprocess: vi.fn().mockResolvedValue(DUMMY_BUFFER),
    recognize: vi.fn().mockResolvedValue('raw ocr text'),
    parseOcr: vi.fn().mockReturnValue(makeOcrResult()),
    cache: { get: vi.fn().mockReturnValue(undefined), set: vi.fn() },
    lookup: vi.fn().mockResolvedValue(makeOkLookupResult()),
    raidConfig: DEFAULT_RAID_CONFIG,
    scorerConfig: DEFAULT_SCORER_CONFIG,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── OCR 실패 ─────────────────────────────────────────────────────────────────

describe('pipeline — OCR 실패', () => {
  it('capture가 throw → ocr_failed (ocrResult: null)', async () => {
    const deps = makeDeps();
    vi.mocked(deps.capture).mockRejectedValue(new Error('capture fail'));

    const result = await runPipeline(TRIGGER, deps);

    expect(result.status).toBe('ocr_failed');
    if (result.status !== 'ocr_failed') return;
    expect(result.ocrResult).toBeNull();
  });

  it('recognize가 throw → ocr_failed (ocrResult: null)', async () => {
    const deps = makeDeps();
    vi.mocked(deps.recognize).mockRejectedValue(new Error('ocr engine error'));

    const result = await runPipeline(TRIGGER, deps);

    expect(result.status).toBe('ocr_failed');
    if (result.status !== 'ocr_failed') return;
    expect(result.ocrResult).toBeNull();
  });

  it('parseOcr가 throw → ocr_failed (ocrResult: null)', async () => {
    const deps = makeDeps();
    vi.mocked(deps.parseOcr).mockImplementation(() => {
      throw new Error('parse error');
    });

    const result = await runPipeline(TRIGGER, deps);

    expect(result.status).toBe('ocr_failed');
    if (result.status !== 'ocr_failed') return;
    expect(result.ocrResult).toBeNull();
  });

  it('ocrResult.name === null → ocr_failed (ocrResult 포함)', async () => {
    const ocrResult = makeOcrResult({ name: null });
    const deps = makeDeps();
    vi.mocked(deps.parseOcr).mockReturnValue(ocrResult);

    const result = await runPipeline(TRIGGER, deps);

    expect(result.status).toBe('ocr_failed');
    if (result.status !== 'ocr_failed') return;
    expect(result.ocrResult).toBe(ocrResult);
  });
});

// ─── preprocess SILENT 실패 ───────────────────────────────────────────────────

describe('pipeline — preprocess SILENT 실패', () => {
  it('preprocess가 throw해도 파이프라인이 계속 진행된다', async () => {
    const deps = makeDeps();
    vi.mocked(deps.preprocess).mockRejectedValue(new Error('preprocess fail'));

    const result = await runPipeline(TRIGGER, deps);

    // preprocess 실패는 SILENT → success까지 도달해야 한다
    expect(result.status).toBe('success');
  });

  it('preprocess 실패 시 recognize는 원본 ImageBuffer로 호출된다', async () => {
    const deps = makeDeps();
    vi.mocked(deps.preprocess).mockRejectedValue(new Error('fail'));

    await runPipeline(TRIGGER, deps);

    // DUMMY_BUFFER(rawImage)로 recognize가 호출됐어야 한다
    expect(vi.mocked(deps.recognize)).toHaveBeenCalledWith(DUMMY_BUFFER);
  });
});

// ─── 스크래핑 실패 ────────────────────────────────────────────────────────────

describe('pipeline — 스크래핑 실패', () => {
  it('NOT_FOUND → not_found (name, ocrResult 포함)', async () => {
    const deps = makeDeps();
    vi.mocked(deps.lookup).mockResolvedValue(makeFailedLookupResult('NOT_FOUND'));

    const result = await runPipeline(TRIGGER, deps);

    expect(result.status).toBe('not_found');
    if (result.status !== 'not_found') return;
    expect(result.name).toBe('테스트');
    expect(result.ocrResult).toBeDefined();
  });

  it('NETWORK_ERROR → network_error (reason: NETWORK_ERROR)', async () => {
    const deps = makeDeps();
    vi.mocked(deps.lookup).mockResolvedValue(makeFailedLookupResult('NETWORK_ERROR'));

    const result = await runPipeline(TRIGGER, deps);

    expect(result.status).toBe('network_error');
    if (result.status !== 'network_error') return;
    expect(result.reason).toBe('NETWORK_ERROR');
  });

  it('TIMEOUT → network_error (reason: TIMEOUT)', async () => {
    const deps = makeDeps();
    vi.mocked(deps.lookup).mockResolvedValue(makeFailedLookupResult('TIMEOUT'));

    const result = await runPipeline(TRIGGER, deps);

    expect(result.status).toBe('network_error');
    if (result.status !== 'network_error') return;
    expect(result.reason).toBe('TIMEOUT');
  });

  it('RATE_LIMITED → network_error (reason: RATE_LIMITED)', async () => {
    const deps = makeDeps();
    vi.mocked(deps.lookup).mockResolvedValue(makeFailedLookupResult('RATE_LIMITED'));

    const result = await runPipeline(TRIGGER, deps);

    expect(result.status).toBe('network_error');
    if (result.status !== 'network_error') return;
    expect(result.reason).toBe('RATE_LIMITED');
  });
});

// ─── 캐시 동작 ────────────────────────────────────────────────────────────────

describe('pipeline — 캐시 동작', () => {
  it('캐시 미스: lookup 호출, cache.set 호출, cacheHit: false', async () => {
    const deps = makeDeps();
    // cache.get → undefined (미스)
    vi.mocked(deps.cache.get).mockReturnValue(undefined);

    const result = await runPipeline(TRIGGER, deps);

    expect(vi.mocked(deps.lookup)).toHaveBeenCalledWith('테스트');
    expect(vi.mocked(deps.cache.set)).toHaveBeenCalledWith('테스트', expect.any(Object));
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.cacheHit).toBe(false);
  });

  it('캐시 히트: lookup 미호출, cacheHit: true', async () => {
    const deps = makeDeps();
    const cached = makeOkLookupResult();
    vi.mocked(deps.cache.get).mockReturnValue(cached);

    const result = await runPipeline(TRIGGER, deps);

    expect(vi.mocked(deps.lookup)).not.toHaveBeenCalled();
    expect(vi.mocked(deps.cache.set)).not.toHaveBeenCalled();
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.cacheHit).toBe(true);
  });

  it('캐시 히트 시 히트된 LookupResult로 파이프라인이 진행된다', async () => {
    const deps = makeDeps();
    const cached = makeOkLookupResult('캐시된캐릭터');
    vi.mocked(deps.cache.get).mockReturnValue(cached);

    const result = await runPipeline(TRIGGER, deps);

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.candidates[0].name).toBe('캐시된캐릭터');
  });
});

// ─── 성공 결과 구조 ───────────────────────────────────────────────────────────

describe('pipeline — 성공 결과 구조', () => {
  it('candidates[0]이 ScoredCandidate 구조를 갖는다', async () => {
    const deps = makeDeps();

    const result = await runPipeline(TRIGGER, deps);

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.candidates[0]).toHaveProperty('score');
    expect(result.candidates[0]).toHaveProperty('eligibleSlots');
    expect(result.candidates[0]).toHaveProperty('name');
    expect(result.candidates[0]).toHaveProperty('jobName');
  });

  it('단독 후보 → success, candidates[0]에 후보 정보 포함', async () => {
    const deps = makeDeps();

    const result = await runPipeline(TRIGGER, deps);

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.candidates[0].name).toBe('테스트');
    expect(result.candidates[0].server).toBe('카인');
  });

  it('두 후보 중 명성이 일치하는 후보가 index 0에 정렬된다', async () => {
    // renown=100_001(OCR) → 카인(100_000)은 fameScore=1.0, 시로코(90_000)는 fameScore=0.0
    const deps = makeDeps();
    vi.mocked(deps.lookup).mockResolvedValue({
      status: 'ok',
      data: [
        {
          name: '테스트',
          server: '카인',
          jobName: '眞 넨마스터',
          adventureName: null,
          renown: 100_000,
          stats: { type: 'damage', primaryValue: 2_000_000_000, displayLabel: '20억' },
          visual: { fullBodyImageUrl: null, jobIconUrl: null },
          fetchedAt: new Date(),
        },
        {
          name: '테스트',
          server: '시로코',
          jobName: '眞 넨마스터',
          adventureName: null,
          renown: 90_000,
          stats: { type: 'damage', primaryValue: 1_000_000_000, displayLabel: '10억' },
          visual: { fullBodyImageUrl: null, jobIconUrl: null },
          fetchedAt: new Date(),
        },
      ],
    });

    const result = await runPipeline(TRIGGER, deps);

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.candidates[0].server).toBe('카인');
  });

  it('durationMs가 0 이상인 숫자다', async () => {
    const deps = makeDeps();

    const result = await runPipeline(TRIGGER, deps);

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(typeof result.durationMs).toBe('number');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('stageDurations에 8개 단계가 모두 포함된다', async () => {
    const deps = makeDeps();

    const result = await runPipeline(TRIGGER, deps);

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;

    const stages = result.stageDurations.map((s) => s.stage);
    expect(stages).toContain('capture');
    expect(stages).toContain('preprocess');
    expect(stages).toContain('recognize');
    expect(stages).toContain('parse');
    expect(stages).toContain('scrape');
    expect(stages).toContain('disambiguate');
    expect(stages).toContain('match');
    expect(stages).toContain('score');
    expect(result.stageDurations).toHaveLength(8);
  });
});

// ─── 정합성: disambiguator 기반 구조 ─────────────────────────────────────────

describe('pipeline — 정합성: disambiguator 기반 구조', () => {
  // 점수가 비슷한 동명이인 2명 → success, candidates 2개 모두 포함
  it('동명이인 2명이 비슷한 직업·명성이어도 success로 전원 반환한다', async () => {
    const deps = makeDeps();
    vi.mocked(deps.parseOcr).mockReturnValue(
      makeOcrResult({ jobName: '넨마스터', renown: 45_901 }),
    );
    vi.mocked(deps.lookup).mockResolvedValue({
      status: 'ok',
      data: [
        {
          name: '테스트', server: '카인',   jobName: '眞 넨마스터',
          adventureName: null, renown: 45_900,
          stats: { type: 'damage', primaryValue: 1_000_000_000, displayLabel: '10억' },
          visual: { fullBodyImageUrl: null, jobIconUrl: null }, fetchedAt: new Date(),
        },
        {
          name: '테스트', server: '시로코', jobName: '眞 넨마스터',
          adventureName: null, renown: 46_050,
          stats: { type: 'damage', primaryValue: 900_000_000, displayLabel: '9억' },
          visual: { fullBodyImageUrl: null, jobIconUrl: null }, fetchedAt: new Date(),
        },
      ],
    });

    const result = await runPipeline(TRIGGER, deps);

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.candidates).toHaveLength(2);
    expect(result.ocrResult).toBeDefined();
  });

  // success.candidates[0]은 ScoredCandidate 구조 (구 data 필드 없음)
  it('success.candidates[0]은 ScoredCandidate다 (primaryCandidate 없음)', async () => {
    const deps = makeDeps();
    vi.mocked(deps.parseOcr).mockReturnValue(
      makeOcrResult({ jobName: '넨마스터', renown: 100_001 }),
    );

    const result = await runPipeline(TRIGGER, deps);

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.candidates[0]).toHaveProperty('score');
    expect(result.candidates[0]).toHaveProperty('eligibleSlots');
    expect(result.candidates[0]).not.toHaveProperty('primaryCandidate');
    expect(result.candidates[0]).not.toHaveProperty('alternativeCandidates');
  });

  // success에 disambiguationStatus 없음 — 앱은 자동 선택하지 않는다
  it('success에는 disambiguationStatus 필드가 없다', async () => {
    const deps = makeDeps();
    vi.mocked(deps.parseOcr).mockReturnValue(
      makeOcrResult({ jobName: '넨마스터', renown: 100_001 }),
    );

    const result = await runPipeline(TRIGGER, deps);

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect((result as Record<string, unknown>).disambiguationStatus).toBeUndefined();
  });
});

// ─── OCR 힌트 → disambiguator 전달 ──────────────────────────────────────────

describe('pipeline — OCR 힌트 → disambiguator 전달', () => {
  it('ocrResult.jobName이 있으면 jobName 매칭 후보가 선택된다', async () => {
    const deps = makeDeps();

    // 두 후보: 크루세이더(버퍼)와 넨마스터(딜러)
    // OCR jobName = '크루세이더' → 크루세이더가 선택돼야 함
    vi.mocked(deps.parseOcr).mockReturnValue(makeOcrResult({ jobName: '크루세이더' }));
    vi.mocked(deps.lookup).mockResolvedValue({
      status: 'ok',
      data: [
        {
          name: '테스트',
          server: '카인',
          jobName: '眞 넨마스터',
          adventureName: null,
          renown: 200_000, // 명성이 더 높지만 jobName 불일치
          stats: { type: 'damage', primaryValue: 5_000_000_000, displayLabel: '50억' },
          visual: { fullBodyImageUrl: null, jobIconUrl: null },
          fetchedAt: new Date(),
        },
        {
          name: '테스트',
          server: '시로코',
          jobName: '眞 크루세이더',
          adventureName: null,
          renown: 100_000,
          stats: { type: 'buff', primaryValue: 7_000_000, displayLabel: '700만' },
          visual: { fullBodyImageUrl: null, jobIconUrl: null },
          fetchedAt: new Date(),
        },
      ],
    });

    const result = await runPipeline(TRIGGER, deps);

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    // jobName 일치 후보가 index 0에 정렬되어야 한다
    expect(result.candidates[0].jobName).toBe('眞 크루세이더');
  });
});
