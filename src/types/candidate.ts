/**
 * candidate.ts — 후보 분석 결과 타입
 *
 * 의존: character.ts, raid.ts
 * 사용처:
 *   - Main: scorer/scoreEngine.ts (ScoredCandidate 생성)
 *   - Main: ranker/candidateRanker.ts (ScoredCandidate[] → RankedCandidateList)
 *   - Main: pipeline.ts (RankedCandidateList → PipelineResult에 포함)
 *   - Renderer: resultStore (currentCandidateIndex로 탐색)
 *   - Renderer: ResultView, CharacterVisual, PrimaryStatLine, CandidateNavigator
 *
 * 변경 영향:
 *   - ScoreBreakdownItem 변경 → scoreEngine, 점수 근거 툴팁 UI
 *   - ScoredCandidate 변경 → scoreEngine 출력, ranker 입력, ResultView 전체
 *   - RankedCandidateList 변경 → pipeline.ts PipelineResult.data,
 *                                resultStore 상태 구조, CandidateNavigator
 */

import type { CharacterData } from './character';
import type { EligibleSlots } from './raid';

/** 점수 계산 근거 1개 항목. 카드 툴팁에 표시 (Tier 3). */
export interface ScoreBreakdownItem {
  label: string;
  rawValue: number;
  weight: number;
  contribution: number;   // rawValue를 정규화한 뒤 weight를 곱한 값
}

/**
 * 단일 후보의 분석 완료 결과.
 * CharacterData(=ScrapedCharacter+role)를 그대로 상속하므로
 * name, server, jobName, adventureName, renown, stats, visual, role 전부 포함.
 */
export interface ScoredCandidate extends CharacterData {
  eligibleSlots: EligibleSlots;
  score: number;
  breakdown: ScoreBreakdownItem[];
  isWarning: boolean;     // score가 ScorerConfig.warnBelowScore 미만
}

/**
 * ranker의 최종 출력이자 PipelineResult.data의 타입.
 *
 * - primaryCandidate: 정렬 기준 1순위. 카드 초기 표시 대상.
 * - alternativeCandidates: 2순위 이하. CandidateNavigator로 탐색.
 * - totalCount === 1이면 CandidateNavigator 숨김.
 */
export interface RankedCandidateList {
  primaryCandidate: ScoredCandidate;
  alternativeCandidates: ScoredCandidate[];
  totalCount: number;
}
