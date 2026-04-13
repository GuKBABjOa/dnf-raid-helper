/**
 * disambiguator/index.ts — 후보 식별 모듈 공개 인터페이스
 *
 * 의존: types/character.ts, disambiguator/types.ts
 * 사용처:
 *   - Main: pipeline/pipeline.ts
 *   - Tests: tests/unit/disambiguator/disambiguator.test.ts
 *
 * 구현 순서 (ADR-012):
 *   scorer → roleMatcher → disambiguator → pipeline 골격 연결
 *   현재 이 파일은 타입 계약과 함수 시그니처만 정의한다.
 *   구현은 tests/unit/disambiguator/disambiguator.test.ts의 11개 시나리오를
 *   모두 통과할 때 완성된 것으로 본다.
 *
 * 내부 로직 개요 (구현 시 참고):
 *   1. candidates = [] → { status: 'not_found' }
 *   2. hints.jobName = null AND hints.renown = null → { status: 'manual', candidates }
 *   3. 각 candidate에 대해 matchScore 계산
 *      jobScore  = jobMatch(hints.jobName, candidate.jobName)     // 0.0~1.0
 *      fameScore = fameMatch(hints.renown, candidate.renown)      // 0.0~1.0
 *      jobWeight = toWeight(hints.fieldConfidences?.job ?? 1.0)   // null이면 0
 *      fameWeight= toWeight(hints.fieldConfidences?.fame ?? 1.0)  // null이면 0
 *      matchScore = (jobScore×jobWeight + fameScore×fameWeight) / (jobWeight+fameWeight)
 *   4. maxAchievableStatus 계산
 *      jobWeight < 0.5 OR fameWeight < 0.5 → recommended 상한
 *   5. 내림차순 정렬 후 상위 2개로 status 판정
 *      auto:        score1 ≥ 0.80 AND (score1-score2)/score1 ≥ 0.40
 *      recommended: score1 ≥ 0.55 AND (score1-score2)/score1 ≥ 0.25
 *      manual:      그 외
 *   6. maxAchievableStatus가 'recommended'이면 auto → recommended로 강등
 *
 * fameValue sanity check (구현 시 참고):
 *   hints.renown이 존재하더라도 10,000 미만이면 신뢰 불가 → fameWeight = 0 처리
 *   parseWarning은 호출자(pipeline)가 별도 기록한다.
 */

import type { ScrapedCharacter } from '../../types/character';
import type { OcrDisambiguationHints, DisambiguationResult } from './types';

export type { OcrDisambiguationHints, DisambiguationResult };

// ─── 내부 헬퍼 ────────────────────────────────────────────────────────────────

/**
 * 직업명 일치 점수.
 * 후보 jobName에 힌트 jobName이 포함(substring)되면 1.0, 아니면 0.0.
 * 예: '眞 스트리트파이터'.includes('스트리트파이터') → 1.0
 */
function jobMatch(hintJob: string, candidateJob: string): number {
  return candidateJob.includes(hintJob) ? 1.0 : 0.0;
}

/**
 * 명성 일치 점수 (3단계).
 *   delta ≤ 500  → 1.0 (strong match)
 *   delta ≤ 3000 → 0.5 (medium match)
 *   delta > 3000 → 0.0 (mismatch)
 */
function fameMatch(hintRenown: number, candidateRenown: number): number {
  const delta = Math.abs(hintRenown - candidateRenown);
  if (delta <= 500) return 1.0;
  if (delta <= 3000) return 0.5;
  return 0.0;
}

/**
 * OCR 신뢰도(0.0~1.0) → 가중치 변환 (3단계).
 *   confidence ≤ 0.50 → 0.10 (낮음)
 *   confidence ≤ 0.80 → 0.50 (중간)
 *   confidence > 0.80 → 1.00 (높음)
 */
function toWeight(confidence: number): number {
  if (confidence <= 0.50) return 0.10;
  if (confidence <= 0.80) return 0.50;
  return 1.00;
}

// ─── resolve ─────────────────────────────────────────────────────────────────

/**
 * ScrapedCharacter[]를 OCR 힌트 유사도 기준으로 내림차순 정렬해 반환한다.
 *
 * @param candidates - 던담 검색 결과 전체. 비어있으면 { status: 'not_found' } 반환.
 * @param hints      - OCR jobName + renown + fieldConfidences.
 * @returns DisambiguationResult — ranked: 정렬된 전체 목록, not_found: 후보 없음.
 *
 * 힌트가 없거나 가중치 분모가 0이면 원본 순서 그대로 반환한다.
 * 선택·판단은 하지 않는다. 정렬만 수행한다.
 */
export function resolve(
  candidates: ScrapedCharacter[],
  hints: OcrDisambiguationHints,
): DisambiguationResult {
  // 1. 빈 후보 → not_found
  if (candidates.length === 0) {
    return { status: 'not_found' };
  }

  // 2. 가중치 계산
  //    jobName=null → jobWeight=0
  //    renown=null 또는 sanity check 실패(< 10,000) → fameWeight=0
  const jobWeight = hints.jobName === null
    ? 0
    : toWeight(hints.fieldConfidences?.job ?? 1.0);

  const fameWeight = hints.renown === null || hints.renown < 10_000
    ? 0
    : toWeight(hints.fieldConfidences?.fame ?? 1.0);

  const denominator = jobWeight + fameWeight;

  // 3. 분모가 0이면 정렬 기준 없음 → 원본 순서 그대로
  if (denominator === 0) {
    return { status: 'ranked', candidates };
  }

  // 4. 각 후보의 matchScore 계산 후 내림차순 정렬
  const validFame = hints.renown !== null && hints.renown >= 10_000;
  const sorted = candidates
    .map((c) => {
      const js = hints.jobName !== null ? jobMatch(hints.jobName, c.jobName) : 0;
      const fs = validFame ? fameMatch(hints.renown as number, c.renown) : 0;
      const matchScore = (js * jobWeight + fs * fameWeight) / denominator;
      return { candidate: c, matchScore };
    })
    .sort((a, b) => b.matchScore - a.matchScore)
    .map((s) => s.candidate);

  return { status: 'ranked', candidates: sorted };
}
