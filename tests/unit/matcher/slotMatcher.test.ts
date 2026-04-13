import { describe, it, expect } from 'vitest';
import { matchSlots } from '../../../src/modules/matcher/slotMatcher';
import type { CharacterData } from '../../../src/types/character';
import type { RaidConfig } from '../../../src/types/raid';
import { DEFAULT_RAID_CONFIG } from '../../../src/config/defaults';

function makeCharacter(role: CharacterData['role']): CharacterData {
  return {
    name: '테스트',
    server: '카인',
    jobName: '테스트직업',
    adventureName: null,
    renown: 30_000,
    stats: { type: 'damage', primaryValue: 1_000_000, displayLabel: '100만' },
    visual: { fullBodyImageUrl: null, jobIconUrl: null },
    fetchedAt: new Date(),
    role,
  };
}

const strictConfig: RaidConfig = {
  raidName: '테스트 공대',
  slots: [
    { id: 'd1', label: '딜러 1', eligibleRoles: ['dealer'], required: true },
    { id: 'd2', label: '딜러 2', eligibleRoles: ['dealer'], required: true },
    { id: 'b1', label: '버퍼', eligibleRoles: ['buffer'], required: true },
    { id: 's1', label: '서포터', eligibleRoles: ['supporter', 'buffer'], required: false },
  ],
};

describe('matchSlots', () => {
  it('딜러는 딜러 슬롯만 반환한다', () => {
    const slots = matchSlots(makeCharacter('dealer'), strictConfig);
    expect(slots).toEqual(['d1', 'd2']);
  });

  it('버퍼는 버퍼 슬롯과 버퍼 허용 서포터 슬롯을 반환한다', () => {
    const slots = matchSlots(makeCharacter('buffer'), strictConfig);
    expect(slots).toContain('b1');
    expect(slots).toContain('s1');
    expect(slots).not.toContain('d1');
  });

  it('서포터는 서포터 허용 슬롯만 반환한다', () => {
    const slots = matchSlots(makeCharacter('supporter'), strictConfig);
    expect(slots).toEqual(['s1']);
  });

  it('unknown role은 빈 배열을 반환한다', () => {
    const slots = matchSlots(makeCharacter('unknown'), strictConfig);
    expect(slots).toEqual([]);
  });

  it('딜러 슬롯이 없는 공대에서 딜러는 빈 배열을 반환한다', () => {
    const bufferOnlyConfig: RaidConfig = {
      raidName: '버퍼만',
      slots: [{ id: 'b1', label: '버퍼', eligibleRoles: ['buffer'], required: true }],
    };
    const slots = matchSlots(makeCharacter('dealer'), bufferOnlyConfig);
    expect(slots).toEqual([]);
  });

  it('DEFAULT_RAID_CONFIG에서 딜러는 4개 슬롯을 반환한다', () => {
    const slots = matchSlots(makeCharacter('dealer'), DEFAULT_RAID_CONFIG);
    expect(slots).toHaveLength(4);
  });

  it('DEFAULT_RAID_CONFIG에서 버퍼는 2~3개 슬롯을 반환한다', () => {
    const slots = matchSlots(makeCharacter('buffer'), DEFAULT_RAID_CONFIG);
    expect(slots.length).toBeGreaterThanOrEqual(2);
  });
});
