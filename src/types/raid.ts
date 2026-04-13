/**
 * raid.ts — 공대 구성 및 슬롯 관련 타입
 *
 * 의존: character.ts (Role)
 * 사용처:
 *   - Main: matcher/slotMatcher.ts (RaidConfig 주입받아 EligibleSlots 계산)
 *   - Main: ranker/candidateRanker.ts (공대 적합 역할 판단)
 *   - Main: config/raidConfig.ts (RaidConfig 기본값 정의)
 *   - candidate.ts (EligibleSlots)
 *
 * 변경 영향:
 *   - SlotDefinition 변경 → slotMatcher, raidConfig
 *   - EligibleSlots 변경 → slotMatcher 출력, ScoredCandidate, 카드 UI 슬롯 배지
 *   - RaidConfig 구조 변경 → slotMatcher, ranker, config/raidConfig.ts
 */

import type { Role } from './character';

export type SlotId = string;

/** 공대 슬롯 1개의 정의. 어떤 역할이 들어갈 수 있는지 선언한다. */
export interface SlotDefinition {
  id: SlotId;
  label: string;          // 예: "딜러 1", "버퍼"
  eligibleRoles: Role[];  // 이 슬롯에 들어갈 수 있는 역할 목록
  required: boolean;      // 공대 구성 필수 여부
}

/**
 * 공대 전체 구성. slotMatcher가 외부에서 주입받는다.
 * config/raidConfig.ts에서 기본값을 제공하고 사용자가 조정할 수 있다.
 */
export interface RaidConfig {
  raidName: string;
  slots: SlotDefinition[];
}

/**
 * 특정 캐릭터가 들어갈 수 있는 슬롯 ID 목록.
 * slotMatcher의 출력. 비어있으면 현재 공대 구성에 맞는 슬롯 없음.
 */
export type EligibleSlots = SlotId[];
