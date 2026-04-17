/**
 * pipeline.ts — 메인 처리 파이프라인
 *
 * 의존: types/, scraper/cache.ts, modules/matcher, modules/scorer, modules/disambiguator
 * 사용처:
 *   - main/ipc/capture.ipc.ts (runPipeline 호출)
 *   - tests/unit/pipeline/pipeline.test.ts
 *
 * 책임 범위:
 *   - OCR 단계 (capture → preprocess → recognize → parseOcr)
 *   - 캐시 조회 / 스크래퍼 호출 / 캐시 저장
 *   - disambiguator로 후보 유사도 정렬
 *   - 정렬된 전체 후보에 match + score 적용
 *   - PipelineResult 조립 및 반환
 *
 * 책임 밖:
 *   - OCR 엔진 구현 (deps.capture / recognize / parseOcr에서 담당)
 *   - 캐시 TTL 정책 (cache.ts 담당)
 *   - 후보 선택·판단 — 하지 않는다. 정렬된 목록을 그대로 반환.
 *
 * preprocess SILENT 정책:
 *   전처리 실패 시 원본 ImageBuffer를 그대로 사용하고 파이프라인을 계속한다.
 */

import type { PipelineResult, PipelineTrigger, StageDuration } from '../types/pipeline';
import type { ParsedOCRResult, ImageBuffer, CaptureRegion } from '../types/ocr';
import type { LookupResult } from '../types/lookup';
import type { CharacterData } from '../types/character';
import type { RaidConfig } from '../types/raid';
import type { ScorerConfig } from '../config/defaults';
import type { OCRRecognitionPayload } from '../ocr/contracts';

import { resolveRole } from '../modules/matcher/roleMatcher';
import { matchSlots } from '../modules/matcher/slotMatcher';
import { scoreEngine } from '../modules/scorer/scoreEngine';
import { resolve as disambiguate } from '../modules/disambiguator';

// ─── PipelineDeps ─────────────────────────────────────────────────────────────

/**
 * pipeline이 필요로 하는 모든 외부 의존을 한 곳에 모은다.
 * 구체 구현이 아닌 함수/인터페이스에 의존하므로 테스트에서 mock 주입이 가능하다.
 */
export interface PipelineDeps {
  /** 화면 영역 캡처. 실패 시 throw → ocr_failed 반환. */
  capture: (region: CaptureRegion) => Promise<ImageBuffer>;
  /** 이미지 전처리(노이즈 제거 등). 실패 시 원본 반환(SILENT). */
  preprocess: (img: ImageBuffer) => Promise<ImageBuffer>;
  /** OCR 텍스트 인식. 실패 시 throw → ocr_failed 반환. */
  recognize: (img: ImageBuffer) => Promise<OCRRecognitionPayload>;
  /** OCR 텍스트 → ParsedOCRResult. 실패 시 throw → ocr_failed 반환. */
  parseOcr: (text: OCRRecognitionPayload) => ParsedOCRResult;
  /** LookupResult 캐시. get/set만 사용. */
  cache: Pick<import('../scraper/cache').LookupCache, 'get' | 'set'>;
  /** 던담 스크래퍼. ScrapedCharacter[] 전체를 반환하는 함수. */
  lookup: (name: string) => Promise<LookupResult>;
  /** 슬롯 매칭에 사용할 공대 구성 */
  raidConfig: RaidConfig;
  /** isWarning 판단 기준 */
  scorerConfig: ScorerConfig;
}

// ─── runPipeline ──────────────────────────────────────────────────────────────

/**
 * 단일 신청자 분석 파이프라인.
 * trigger.region을 캡처해서 PipelineResult를 반환한다.
 *
 * 단계 순서: capture → preprocess → recognize → parseOcr
 *           → cache.get / lookup / cache.set
 *           → match (resolveRole + matchSlots) per candidate
 *           → score (scoreEngine) per candidate
 *           → rank (rankCandidates)
 *           → PipelineResult
 */
export async function runPipeline(
  trigger: PipelineTrigger,
  deps: PipelineDeps,
): Promise<PipelineResult> {
  const pipelineStart = Date.now();
  const stageDurations: StageDuration[] = [];

  // ── Phase 1: OCR ────────────────────────────────────────────────────────────

  let rawImage: ImageBuffer;
  try {
    const t = Date.now();
    rawImage = await deps.capture(trigger.region);
    stageDurations.push({ stage: 'capture', durationMs: Date.now() - t });
  } catch {
    return { status: 'ocr_failed', ocrResult: null };
  }

  // preprocess: 실패해도 원본 사용 (SILENT)
  let processedImage: ImageBuffer;
  {
    const t = Date.now();
    try {
      processedImage = await deps.preprocess(rawImage);
    } catch {
      processedImage = rawImage;
    }
    stageDurations.push({ stage: 'preprocess', durationMs: Date.now() - t });
  }

  let rawText: OCRRecognitionPayload;
  try {
    const t = Date.now();
    rawText = await deps.recognize(processedImage);
    stageDurations.push({ stage: 'recognize', durationMs: Date.now() - t });
  } catch {
    return { status: 'ocr_failed', ocrResult: null };
  }

  let ocrResult: ParsedOCRResult;
  try {
    const t = Date.now();
    ocrResult = deps.parseOcr(rawText);
    stageDurations.push({ stage: 'parse', durationMs: Date.now() - t });
  } catch {
    return { status: 'ocr_failed', ocrResult: null };
  }

  if (ocrResult.name === null) {
    return { status: 'ocr_failed', ocrResult };
  }

  const name = ocrResult.name;

  // ── Phase 2: Scrape (cache.get → lookup → cache.set) ───────────────────────

  let lookupResult: LookupResult;
  let cacheHit: boolean;
  {
    const t = Date.now();
    const cached = deps.cache.get(name);
    if (cached !== undefined) {
      lookupResult = cached;
      cacheHit = true;
    } else {
      lookupResult = await deps.lookup(name);
      deps.cache.set(name, lookupResult);
      cacheHit = false;
    }
    stageDurations.push({ stage: 'scrape', durationMs: Date.now() - t });
  }

  if (lookupResult.status === 'failed') {
    if (lookupResult.reason === 'NOT_FOUND') {
      return { status: 'not_found', name, ocrResult };
    }
    return { status: 'network_error', name, reason: lookupResult.reason, ocrResult };
  }

  // ── Phase 3: Disambiguate — 유사도 정렬 ───────────────────────────────────

  let rankedCandidates: import('../types/character').ScrapedCharacter[];
  {
    const t = Date.now();
    const dr = disambiguate(lookupResult.data, {
      jobName: ocrResult.jobName,
      renown: ocrResult.renown,
    });
    stageDurations.push({ stage: 'disambiguate', durationMs: Date.now() - t });

    if (dr.status === 'not_found') {
      return { status: 'not_found', name, ocrResult };
    }
    rankedCandidates = dr.candidates;
  }

  // ── Phase 4+5: Match + Score — 정렬된 전체 후보에 적용 ───────────────────

  const matchStart = Date.now();
  const scoredCandidates = rankedCandidates.map((c) => {
    const role = resolveRole({ jobName: c.jobName, statsType: c.stats.type });
    const characterData: CharacterData = { ...c, role };
    const eligibleSlots = matchSlots(characterData, deps.raidConfig);
    return scoreEngine(characterData, eligibleSlots, deps.scorerConfig);
  });
  stageDurations.push({ stage: 'match', durationMs: Date.now() - matchStart });
  stageDurations.push({ stage: 'score', durationMs: 0 }); // match와 함께 측정됨

  // ── Result ──────────────────────────────────────────────────────────────────

  return {
    status: 'success',
    candidates: scoredCandidates,
    ocrResult,
    cacheHit,
    durationMs: Date.now() - pipelineStart,
    stageDurations,
  };
}
