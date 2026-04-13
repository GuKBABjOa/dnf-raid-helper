/**
 * disambiguator/types.ts — 후보 식별 모듈의 입출력 계약
 *
 * 의존: types/character.ts (ScrapedCharacter)
 * 사용처:
 *   - Main: modules/disambiguator/index.ts (resolve 함수 시그니처)
 *   - Main: pipeline/pipeline.ts (DisambiguationResult 분기 처리)
 *   - Tests: tests/unit/disambiguator/disambiguator.test.ts
 *
 * 책임 범위:
 *   - "던담 검색 결과 N개 중 어느 것이 현재 신청자인가"를 판단하는 타입만 정의
 *   - 공대 적합도(score, isWarning)와 무관
 *
 * 설계 근거:
 *   - ADR-020: Disambiguator 모듈 신설
 *   - ADR-021: 동일인 신뢰도 3단계 분류 (auto / recommended / manual)
 *   - ADR-026: server를 OCR 입력이 아닌 SearchCandidate에서 획득
 */

import type { ScrapedCharacter } from '../../types/character';

/**
 * OCR에서 추출한 직업·명성 힌트.
 * pipeline.ts가 ParsedOCRResult에서 필요한 필드만 추출해 전달한다.
 *
 * fieldConfidences:
 *   생략 시 { job: 1.0, fame: 1.0 }으로 처리한다.
 *   job / fame 각각 0.0~1.0. 임계값(0.50, 0.80) 기준으로 가중치로 변환된다.
 *   jobName = null이면 fieldConfidences.job 값과 무관하게 jobWeight = 0.
 *   renown  = null이면 fieldConfidences.fame 값과 무관하게 fameWeight = 0.
 */
export interface OcrDisambiguationHints {
  jobName: string | null;
  renown: number | null;
  fieldConfidences?: {
    job: number;   // 0.0 ~ 1.0
    fame: number;  // 0.0 ~ 1.0
  };
}

/**
 * disambiguator.resolve()의 최종 출력.
 * pipeline.ts가 status로 다음 단계를 결정한다.
 *
 * | status    | 의미                                       | pipeline 후속 동작                       |
 * |-----------|--------------------------------------------|-----------------------------------------|
 * | ranked    | 후보를 유사도 내림차순 정렬해 반환.          | 전체에 match → score 적용 후 목록 반환   |
 * | not_found | candidates 배열이 비어있음.                | pipeline not_found 반환                 |
 *
 * candidates: 유사도(matchScore) 내림차순 정렬. index 0 = 가장 유사한 후보.
 * 힌트가 없어도 candidates는 원본 순서 그대로 반환한다 (정렬 기준 없음).
 */
export type DisambiguationResult =
  | { status: 'ranked';    candidates: ScrapedCharacter[] }
  | { status: 'not_found' };
