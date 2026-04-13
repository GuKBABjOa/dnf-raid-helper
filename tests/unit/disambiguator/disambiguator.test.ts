/**
 * disambiguator.test.ts — 후보 정렬 모듈 단위 테스트
 *
 * 검증 대상: src/modules/disambiguator/index.ts (resolve 함수)
 * 반환 타입: { status: 'ranked', candidates: ScrapedCharacter[] } | { status: 'not_found' }
 *
 * 앱은 후보를 자동 선택하지 않는다. 유사도 내림차순 정렬만 수행한다.
 * 공대장이 ← → 네비게이터로 직접 순회하며 판단한다.
 */

import { describe, it, expect } from 'vitest';
import { resolve } from '../../../src/modules/disambiguator/index';
import type { OcrDisambiguationHints } from '../../../src/modules/disambiguator/types';
import type { ScrapedCharacter } from '../../../src/types/character';

// ─── 팩토리 ────────────────────────────────────────────────────────────────────

function makeCandidate(overrides: Partial<ScrapedCharacter> = {}): ScrapedCharacter {
  return {
    name: '아이유',
    server: '아린',
    jobName: '眞 스트리트파이터',
    adventureName: null,
    renown: 45_900,
    stats: { type: 'damage', primaryValue: 1_000_000_000, displayLabel: '10억' },
    visual: { fullBodyImageUrl: null, jobIconUrl: null },
    fetchedAt: new Date(),
    ...overrides,
  };
}

function makeHints(overrides: Partial<OcrDisambiguationHints> = {}): OcrDisambiguationHints {
  return {
    jobName: '스트리트파이터',
    renown: 45_901,
    ...overrides,
  };
}

// ─── 핵심 정렬 시나리오 ────────────────────────────────────────────────────────

describe('disambiguator — 핵심 정렬 시나리오', () => {

  /**
   * S-01: 단독 후보, job exact match + fame strong match → ranked, 1명 반환
   */
  it('S-01: 단독 후보이고 직업·명성이 일치하면 ranked를 반환한다', () => {
    const candidates = [
      makeCandidate({ server: '아린', jobName: '眞 스트리트파이터', renown: 45_900 }),
    ];
    const result = resolve(candidates, makeHints());

    expect(result.status).toBe('ranked');
    if (result.status !== 'ranked') return;
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].server).toBe('아린');
  });

  /**
   * S-02: 동명이인 2명, 직업이 다름
   * 직업 일치한 후보(아린)가 index 0에 정렬되어야 한다.
   */
  it('S-02: 직업이 일치하는 후보가 index 0에 정렬된다', () => {
    const candidates = [
      makeCandidate({ server: '풍칼', jobName: '眞 크루세이더',     renown: 105_377 }),
      makeCandidate({ server: '아린', jobName: '眞 스트리트파이터', renown: 45_900  }),
    ];
    const result = resolve(candidates, makeHints({ jobName: '스트리트파이터', renown: 45_901 }));

    expect(result.status).toBe('ranked');
    if (result.status !== 'ranked') return;
    expect(result.candidates[0].server).toBe('아린');
  });

  /**
   * S-03: 동명이인 2명, 직업 동일, 명성 차이 큼
   * 명성이 더 가까운 후보(아린)이 index 0.
   */
  it('S-03: 명성이 더 가까운 후보가 index 0에 정렬된다', () => {
    const candidates = [
      makeCandidate({ server: '시로코', jobName: '眞 스트리트파이터', renown: 89_000 }),
      makeCandidate({ server: '아린',   jobName: '眞 스트리트파이터', renown: 45_900 }),
    ];
    const result = resolve(candidates, makeHints({ jobName: '스트리트파이터', renown: 45_901 }));

    expect(result.status).toBe('ranked');
    if (result.status !== 'ranked') return;
    expect(result.candidates[0].server).toBe('아린');
  });

  /**
   * S-04: 동명이인 2명, 직업+명성 모두 비슷 → ranked, 전원 반환
   * 앱은 판단하지 않는다. 점수가 동률이어도 두 후보 모두 반환한다.
   */
  it('S-04: 직업·명성이 비슷한 동명이인도 ranked로 전원 반환된다', () => {
    const candidates = [
      makeCandidate({ server: '아린',   jobName: '眞 스트리트파이터', renown: 45_900 }),
      makeCandidate({ server: '시로코', jobName: '眞 스트리트파이터', renown: 46_050 }),
    ];
    const result = resolve(candidates, makeHints({ jobName: '스트리트파이터', renown: 45_901 }));

    expect(result.status).toBe('ranked');
    if (result.status !== 'ranked') return;
    expect(result.candidates).toHaveLength(2);
  });

  /**
   * S-05: jobName=null → 명성만으로 정렬
   * 명성이 힌트(45901)에 가까운 아린이 index 0.
   */
  it('S-05: jobName이 null이면 명성 기준으로만 정렬된다', () => {
    const candidates = [
      makeCandidate({ server: '풍칼', jobName: '眞 크루세이더',     renown: 105_377 }),
      makeCandidate({ server: '아린', jobName: '眞 스트리트파이터', renown: 45_900  }),
    ];
    const result = resolve(candidates, makeHints({ jobName: null, renown: 45_901 }));

    expect(result.status).toBe('ranked');
    if (result.status !== 'ranked') return;
    expect(result.candidates[0].server).toBe('아린');
  });

  /**
   * S-06: renown=null → 직업만으로 정렬
   * 직업이 일치하는 아린이 index 0.
   */
  it('S-06: renown이 null이면 직업 기준으로만 정렬된다', () => {
    const candidates = [
      makeCandidate({ server: '풍칼', jobName: '眞 크루세이더',     renown: 105_377 }),
      makeCandidate({ server: '아린', jobName: '眞 스트리트파이터', renown: 45_900  }),
    ];
    const result = resolve(candidates, makeHints({ jobName: '스트리트파이터', renown: null }));

    expect(result.status).toBe('ranked');
    if (result.status !== 'ranked') return;
    expect(result.candidates[0].server).toBe('아린');
  });

  /**
   * S-07: jobName=null AND renown=null → 힌트 없음, 원본 순서 그대로 반환
   */
  it('S-07: jobName과 renown이 모두 null이면 원본 순서 그대로 ranked 반환한다', () => {
    const candidates = [
      makeCandidate({ server: '아린' }),
      makeCandidate({ server: '풍칼' }),
    ];
    const result = resolve(candidates, makeHints({ jobName: null, renown: null }));

    expect(result.status).toBe('ranked');
    if (result.status !== 'ranked') return;
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0].server).toBe('아린');
    expect(result.candidates[1].server).toBe('풍칼');
  });

  /**
   * S-08: 빈 배열 → not_found (throw하지 않음)
   */
  it('S-08: 후보가 없으면 throw하지 않고 not_found를 반환한다', () => {
    expect(() => resolve([], makeHints())).not.toThrow();

    const result = resolve([], makeHints());
    expect(result.status).toBe('not_found');
  });

  /**
   * S-09: 단독 후보, 직업·명성 모두 불일치 → ranked (후보 반환)
   * 앱은 판단하지 않는다. 후보가 있으면 항상 ranked.
   */
  it('S-09: 단독 후보는 직업·명성 불일치여도 ranked로 반환된다', () => {
    const candidates = [
      makeCandidate({ server: '아린', jobName: '眞 소울브링어', renown: 88_000 }),
    ];
    const result = resolve(candidates, makeHints({ jobName: '버서커', renown: 50_000 }));

    expect(result.status).toBe('ranked');
    if (result.status !== 'ranked') return;
    expect(result.candidates).toHaveLength(1);
  });
});

// ─── fameValue sanity check ────────────────────────────────────────────────────

describe('disambiguator — fameValue sanity check', () => {

  /**
   * S-12: renown=4590 → 10,000 미만 → fameWeight=0 → 직업 기준으로만 정렬
   * fame 힌트를 무시하므로 job이 일치하는 아린이 index 0.
   */
  it('S-12: renown이 10,000 미만이면 fame 힌트를 무시하고 직업 기준으로만 정렬한다', () => {
    const candidates = [
      makeCandidate({ server: '풍칼', jobName: '眞 크루세이더',     renown: 4_500 }),
      makeCandidate({ server: '아린', jobName: '眞 스트리트파이터', renown: 45_900 }),
    ];
    // renown=4590: sanity check 실패 → fameWeight=0
    const result = resolve(candidates, makeHints({ jobName: '스트리트파이터', renown: 4_590 }));

    expect(result.status).toBe('ranked');
    if (result.status !== 'ranked') return;
    // fame 무시, job 일치한 아린이 index 0
    expect(result.candidates[0].server).toBe('아린');
  });

  it('S-12 대조군: 정상 renown이면 직업+명성 모두 반영해 정렬한다', () => {
    const candidates = [
      makeCandidate({ server: '풍칼', jobName: '眞 크루세이더',     renown: 105_377 }),
      makeCandidate({ server: '아린', jobName: '眞 스트리트파이터', renown: 45_900  }),
    ];
    const result = resolve(candidates, makeHints({ jobName: '스트리트파이터', renown: 45_901 }));

    expect(result.status).toBe('ranked');
    if (result.status !== 'ranked') return;
    expect(result.candidates[0].server).toBe('아린');
  });
});

// ─── fieldConfidences 가중치 반영 ─────────────────────────────────────────────

describe('disambiguator — fieldConfidences 가중치 반영', () => {

  /**
   * S-13: job confidence 낮음(0.35) → jobWeight=0.10
   * 후보A: job 일치, fame 불일치 / 후보B: job 불일치, fame 일치
   *
   * jobWeight 낮음 → fame이 지배적 → fameScore 높은 후보B가 index 0
   */
  it('S-13: job confidence가 낮으면 fame이 높은 후보가 더 높이 정렬된다', () => {
    const candidates = [
      // 후보A: job 일치 + fame 큰 불일치
      makeCandidate({ server: '아린',   jobName: '眞 스트리트파이터', renown: 45_900 }),
      // 후보B: job 불일치 + fame 강 일치
      makeCandidate({ server: '시로코', jobName: '眞 크루세이더',     renown: 100_000 }),
    ];
    const result = resolve(candidates, makeHints({
      jobName: '스트리트파이터',
      renown: 100_001,   // 시로코(100_000)와 delta=1, 아린(45_900)과 delta=54_101
      fieldConfidences: { job: 0.35, fame: 0.95 }, // job 신뢰도 낮음
    }));

    expect(result.status).toBe('ranked');
    if (result.status !== 'ranked') return;
    // jobWeight=0.10(낮음), fameWeight=1.0(높음) → fame 지배적 → 시로코가 index 0
    expect(result.candidates[0].server).toBe('시로코');
  });

  it('S-13 대조군: job confidence가 정상이면 job 일치 후보가 더 높이 정렬된다', () => {
    const candidates = [
      makeCandidate({ server: '아린',   jobName: '眞 스트리트파이터', renown: 45_900  }),
      makeCandidate({ server: '시로코', jobName: '眞 크루세이더',     renown: 100_000 }),
    ];
    const result = resolve(candidates, makeHints({
      jobName: '스트리트파이터',
      renown: 100_001,
      fieldConfidences: { job: 0.92, fame: 0.95 }, // job 신뢰도 정상
    }));

    expect(result.status).toBe('ranked');
    if (result.status !== 'ranked') return;
    // jobWeight=1.0(높음) → job 일치한 아린이 index 0
    expect(result.candidates[0].server).toBe('아린');
  });
});

// ─── 결과 타입 불변식 ──────────────────────────────────────────────────────────

describe('disambiguator — 결과 타입 불변식', () => {

  it('ranked 결과에는 candidates 배열이 반드시 포함된다', () => {
    const candidates = [makeCandidate()];
    const result = resolve(candidates, makeHints());

    expect(result.status).toBe('ranked');
    if (result.status !== 'ranked') return;
    expect(Array.isArray(result.candidates)).toBe(true);
    expect(result.candidates.length).toBeGreaterThan(0);
  });

  it('ranked 결과의 candidates 길이는 입력 길이와 같다', () => {
    const candidates = [
      makeCandidate({ server: '아린'   }),
      makeCandidate({ server: '시로코' }),
      makeCandidate({ server: '카인'   }),
    ];
    const result = resolve(candidates, makeHints());

    expect(result.status).toBe('ranked');
    if (result.status !== 'ranked') return;
    expect(result.candidates).toHaveLength(3);
  });

  it('not_found 결과는 candidates 필드를 갖지 않는다', () => {
    const result = resolve([], makeHints());

    expect(result.status).toBe('not_found');
    expect((result as Record<string, unknown>).candidates).toBeUndefined();
  });
});
