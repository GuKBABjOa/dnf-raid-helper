import { describe, it, expect } from 'vitest';
import { scoreEngine } from '../../../src/modules/scorer/scoreEngine';
import type { CharacterData } from '../../../src/types/character';
import type { ScorerConfig } from '../../../src/config/defaults';

function makeDealer(overrides: Partial<CharacterData> = {}): CharacterData {
  return {
    name: '테스트캐릭',
    server: '카인',
    jobName: '眞 소검마스터',
    adventureName: '테스트모험단',
    renown: 50_000,
    stats: { type: 'damage', primaryValue: 2_000_000_000, displayLabel: '20억' },
    visual: { fullBodyImageUrl: null, jobIconUrl: null },
    fetchedAt: new Date(),
    role: 'dealer',
    ...overrides,
  };
}

function makeBuffer(overrides: Partial<CharacterData> = {}): CharacterData {
  return {
    name: '버퍼캐릭',
    server: '카인',
    jobName: '眞 크루세이더',
    adventureName: '버퍼단',
    renown: 40_000,
    stats: { type: 'buff', primaryValue: 7_000_000, displayLabel: '7,000,000' },
    visual: { fullBodyImageUrl: null, jobIconUrl: null },
    fetchedAt: new Date(),
    role: 'buffer',
    ...overrides,
  };
}

const config: ScorerConfig = { warnBelowRenown: 20_000 };

describe('scoreEngine', () => {
  it('score는 stats.primaryValue와 동일하다', () => {
    const result = scoreEngine(makeDealer(), ['dealer-1'], config);
    expect(result.score).toBe(2_000_000_000);
  });

  it('renown이 임계값 이상이면 isWarning: false', () => {
    const result = scoreEngine(makeDealer({ renown: 50_000 }), [], config);
    expect(result.isWarning).toBe(false);
  });

  it('renown이 임계값 미만이면 isWarning: true', () => {
    const result = scoreEngine(makeDealer({ renown: 10_000 }), [], config);
    expect(result.isWarning).toBe(true);
  });

  it('renown이 임계값과 정확히 같으면 isWarning: false', () => {
    const result = scoreEngine(makeDealer({ renown: 20_000 }), [], config);
    expect(result.isWarning).toBe(false);
  });

  it('breakdown에 딜 수치 항목이 포함된다', () => {
    const result = scoreEngine(makeDealer(), [], config);
    const dealerItem = result.breakdown.find((b) => b.label === '딜 수치');
    expect(dealerItem).toBeDefined();
    expect(dealerItem?.rawValue).toBe(2_000_000_000);
  });

  it('버퍼 캐릭터의 breakdown label은 버프점수다', () => {
    const result = scoreEngine(makeBuffer(), [], config);
    const buffItem = result.breakdown.find((b) => b.label === '버프점수');
    expect(buffItem).toBeDefined();
  });

  it('eligibleSlots이 결과에 포함된다', () => {
    const result = scoreEngine(makeDealer(), ['dealer-1', 'dealer-2'], config);
    expect(result.eligibleSlots).toEqual(['dealer-1', 'dealer-2']);
  });

  it('원본 CharacterData 필드가 그대로 유지된다', () => {
    const character = makeDealer();
    const result = scoreEngine(character, [], config);
    expect(result.name).toBe(character.name);
    expect(result.role).toBe(character.role);
    expect(result.jobName).toBe(character.jobName);
  });
});
