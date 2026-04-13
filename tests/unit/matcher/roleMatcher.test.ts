import { describe, it, expect } from 'vitest';
import { resolveRole } from '../../../src/modules/matcher/roleMatcher';

// ─── statsType 우선 규칙 ──────────────────────────────────────────────────────

describe('resolveRole — statsType 우선', () => {

  it('statsType=synergy이면 jobName이 딜러여도 synergy를 반환한다', () => {
    expect(resolveRole({ jobName: '眞 드래곤나이트', statsType: 'synergy' })).toBe('synergy');
  });

  it('statsType=synergy이면 jobName이 빈 문자열이어도 synergy를 반환한다', () => {
    expect(resolveRole({ jobName: '', statsType: 'synergy' })).toBe('synergy');
  });

  it('statsType=synergy이면 jobName이 버퍼 직업이어도 synergy를 반환한다 (충돌 케이스)', () => {
    // 실제로 발생하지 않지만 규칙 우선순위 검증
    expect(resolveRole({ jobName: '眞 크루세이더', statsType: 'synergy' })).toBe('synergy');
  });

});

// ─── 버퍼 직업 ────────────────────────────────────────────────────────────────

describe('resolveRole — 버퍼 직업', () => {

  it('眞 크루세이더 → buffer', () => {
    expect(resolveRole({ jobName: '眞 크루세이더', statsType: 'buff' })).toBe('buffer');
  });

  it('크루세이더 (眞 없음) → buffer', () => {
    expect(resolveRole({ jobName: '크루세이더', statsType: 'buff' })).toBe('buffer');
  });

  it('眞 인챈트리스 → buffer', () => {
    expect(resolveRole({ jobName: '眞 인챈트리스', statsType: 'buff' })).toBe('buffer');
  });

  it('眞 뮤즈 → buffer', () => {
    expect(resolveRole({ jobName: '眞 뮤즈', statsType: 'buff' })).toBe('buffer');
  });

});

// ─── 서포터 직업 ──────────────────────────────────────────────────────────────

describe('resolveRole — 서포터 직업', () => {

  it('眞 무당 → supporter', () => {
    expect(resolveRole({ jobName: '眞 무당', statsType: 'damage' })).toBe('supporter');
  });

  it('무당 (眞 없음) → supporter', () => {
    expect(resolveRole({ jobName: '무당', statsType: 'damage' })).toBe('supporter');
  });

});

// ─── 딜러 직업 ────────────────────────────────────────────────────────────────

describe('resolveRole — 딜러 직업', () => {

  it('眞 소드마스터 → dealer', () => {
    expect(resolveRole({ jobName: '眞 소드마스터', statsType: 'damage' })).toBe('dealer');
  });

  it('眞 스트리트파이터 → dealer', () => {
    expect(resolveRole({ jobName: '眞 스트리트파이터', statsType: 'damage' })).toBe('dealer');
  });

  it('眞 블러드 메이지 (두 단어 직업명) → dealer', () => {
    expect(resolveRole({ jobName: '眞 블러드 메이지', statsType: 'damage' })).toBe('dealer');
  });

  it('검성 (眞 없는 미각성 직업) → dealer', () => {
    expect(resolveRole({ jobName: '검성', statsType: 'damage' })).toBe('dealer');
  });

  it('알 수 없는 직업명도 dealer 반환 (기본값)', () => {
    expect(resolveRole({ jobName: '완전히 없는 직업명', statsType: 'damage' })).toBe('dealer');
  });

});

// ─── unknown ──────────────────────────────────────────────────────────────────

describe('resolveRole — unknown', () => {

  it('빈 jobName + damage → unknown', () => {
    expect(resolveRole({ jobName: '', statsType: 'damage' })).toBe('unknown');
  });

  it('공백만 있는 jobName + buff → unknown', () => {
    expect(resolveRole({ jobName: '   ', statsType: 'buff' })).toBe('unknown');
  });

});
