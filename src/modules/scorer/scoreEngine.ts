import type { CharacterData } from '../../types/character';
import type { EligibleSlots } from '../../types/raid';
import type { ScoredCandidate, ScoreBreakdownItem } from '../../types/candidate';
import type { ScorerConfig } from '../../config/defaults';

/**
 * CharacterData → ScoredCandidate.
 * 순수 함수. 외부 의존 없음.
 *
 * score: stats.primaryValue 그대로 사용 (딜 숫자 또는 버프점수).
 * isWarning: renown < config.warnBelowRenown.
 */
export function scoreEngine(
  character: CharacterData,
  eligibleSlots: EligibleSlots,
  config: ScorerConfig,
): ScoredCandidate {
  const { stats, renown } = character;

  const breakdown: ScoreBreakdownItem[] = [
    {
      label: stats.type === 'damage' ? '딜 수치' : '버프점수',
      rawValue: stats.primaryValue,
      weight: 1,
      contribution: stats.primaryValue,
    },
    {
      label: '명성',
      rawValue: renown,
      weight: 0, // 참고용. 점수에 반영하지 않음.
      contribution: 0,
    },
  ];

  return {
    ...character,
    eligibleSlots,
    score: stats.primaryValue,
    breakdown,
    isWarning: renown < config.warnBelowRenown,
  };
}
