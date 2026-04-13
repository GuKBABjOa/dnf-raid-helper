import type { CharacterData } from '../../types/character';
import type { RaidConfig, EligibleSlots } from '../../types/raid';

/**
 * CharacterData.role 기준으로 현재 공대 슬롯에서 들어갈 수 있는 슬롯 ID 목록 반환.
 * 순수 함수. RaidConfig는 외부에서 주입받는다.
 *
 * 반환값이 빈 배열이면 현재 공대 구성에 맞는 슬롯이 없다는 의미.
 * role === 'unknown'이면 항상 빈 배열 반환.
 */
export function matchSlots(
  character: CharacterData,
  raidConfig: RaidConfig,
): EligibleSlots {
  if (character.role === 'unknown') return [];

  return raidConfig.slots
    .filter((slot) => slot.eligibleRoles.includes(character.role))
    .map((slot) => slot.id);
}
