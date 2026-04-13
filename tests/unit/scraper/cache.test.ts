import { describe, it, expect, afterEach, vi } from 'vitest';
import { LookupCache, NOT_FOUND_TTL_MS } from '../../../src/scraper/cache';
import type { LookupResult } from '../../../src/types/lookup';

afterEach(() => {
  vi.useRealTimers();
});

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────

function makeOkResult(names: string[]): LookupResult {
  return {
    status: 'ok',
    data: names.map((name) => ({
      name,
      server: '카인',
      jobName: '眞 넨마스터',
      adventureName: null,
      renown: 100_000,
      stats: { type: 'damage', primaryValue: 1_000_000_000, displayLabel: '10억' },
      visual: { fullBodyImageUrl: null, jobIconUrl: null },
      fetchedAt: new Date(),
    })),
  };
}

function makeFailedResult(
  name: string,
  reason: Extract<LookupResult, { status: 'failed' }>['reason'],
): LookupResult {
  return { status: 'failed', name, reason, attemptedAt: new Date() };
}

// ─── ok 저장/조회 ─────────────────────────────────────────────────────────────

describe('ok 결과 저장/조회', () => {
  it('set 후 get → 동일한 LookupResult를 반환한다', () => {
    const cache = new LookupCache();
    const result = makeOkResult(['캐릭터A', '캐릭터B']);

    cache.set('캐릭터A', result);

    expect(cache.get('캐릭터A')).toBe(result);
  });

  it('존재하지 않는 키 → undefined를 반환한다', () => {
    const cache = new LookupCache();
    expect(cache.get('없는캐릭터')).toBeUndefined();
  });

  it('ok 결과는 시간이 지나도 만료되지 않는다', () => {
    vi.useFakeTimers();
    const cache = new LookupCache();
    const result = makeOkResult(['캐릭터A']);

    cache.set('캐릭터A', result);

    // 1년 경과
    vi.advanceTimersByTime(365 * 24 * 60 * 60 * 1000);

    expect(cache.get('캐릭터A')).toBe(result);
  });

  it('ok 결과의 data 배열 구조가 그대로 유지된다', () => {
    const cache = new LookupCache();
    const result = makeOkResult(['캐릭터A', '캐릭터B', '캐릭터C']);

    cache.set('캐릭터A', result);

    const retrieved = cache.get('캐릭터A');
    expect(retrieved?.status).toBe('ok');
    if (retrieved?.status !== 'ok') return;

    expect(retrieved.data).toHaveLength(3);
    expect(retrieved.data[0].name).toBe('캐릭터A');
    expect(retrieved.data[1].name).toBe('캐릭터B');
    expect(retrieved.data[2].name).toBe('캐릭터C');
  });

  it('ok 결과의 data는 원본 배열 참조와 동일하다 (복사하지 않는다)', () => {
    const cache = new LookupCache();
    const result = makeOkResult(['캐릭터A']);

    cache.set('캐릭터A', result);

    const retrieved = cache.get('캐릭터A');
    expect(retrieved?.status).toBe('ok');
    if (retrieved?.status !== 'ok') return;

    expect(retrieved.data).toBe((result as Extract<LookupResult, { status: 'ok' }>).data);
  });
});

// ─── NOT_FOUND TTL ────────────────────────────────────────────────────────────

describe('NOT_FOUND TTL', () => {
  it('TTL 만료 전에는 NOT_FOUND 결과를 반환한다', () => {
    vi.useFakeTimers();
    const cache = new LookupCache();
    const result = makeFailedResult('없는캐릭터', 'NOT_FOUND');

    cache.set('없는캐릭터', result);
    vi.advanceTimersByTime(NOT_FOUND_TTL_MS - 1);

    expect(cache.get('없는캐릭터')).toBe(result);
  });

  it('TTL 정확히 만료된 시점에 undefined를 반환한다', () => {
    vi.useFakeTimers();
    const cache = new LookupCache();
    const result = makeFailedResult('없는캐릭터', 'NOT_FOUND');

    cache.set('없는캐릭터', result);
    vi.advanceTimersByTime(NOT_FOUND_TTL_MS);

    expect(cache.get('없는캐릭터')).toBeUndefined();
  });

  it('TTL 만료 후 size가 줄어든다 (만료 항목 제거)', () => {
    vi.useFakeTimers();
    const cache = new LookupCache();
    cache.set('없는캐릭터', makeFailedResult('없는캐릭터', 'NOT_FOUND'));
    expect(cache.size).toBe(1);

    vi.advanceTimersByTime(NOT_FOUND_TTL_MS);
    cache.get('없는캐릭터'); // 만료 확인 트리거

    expect(cache.size).toBe(0);
  });

  it('NOT_FOUND_TTL_MS는 60초다', () => {
    expect(NOT_FOUND_TTL_MS).toBe(60_000);
  });
});

// ─── 미캐시 결과 ──────────────────────────────────────────────────────────────

describe('캐시하지 않는 결과', () => {
  it('NETWORK_ERROR → set 후 get이 undefined다', () => {
    const cache = new LookupCache();
    cache.set('테스트', makeFailedResult('테스트', 'NETWORK_ERROR'));
    expect(cache.get('테스트')).toBeUndefined();
  });

  it('TIMEOUT → set 후 get이 undefined다', () => {
    const cache = new LookupCache();
    cache.set('테스트', makeFailedResult('테스트', 'TIMEOUT'));
    expect(cache.get('테스트')).toBeUndefined();
  });

  it('RATE_LIMITED → set 후 get이 undefined다', () => {
    const cache = new LookupCache();
    cache.set('테스트', makeFailedResult('테스트', 'RATE_LIMITED'));
    expect(cache.get('테스트')).toBeUndefined();
  });

  it('PARSE_ERROR → set 후 get이 undefined다', () => {
    const cache = new LookupCache();
    cache.set('테스트', makeFailedResult('테스트', 'PARSE_ERROR'));
    expect(cache.get('테스트')).toBeUndefined();
  });

  it('미캐시 결과는 size에 영향을 주지 않는다', () => {
    const cache = new LookupCache();
    cache.set('테스트', makeFailedResult('테스트', 'NETWORK_ERROR'));
    expect(cache.size).toBe(0);
  });
});

// ─── LRU eviction ─────────────────────────────────────────────────────────────

describe('LRU eviction', () => {
  it('maxSize 초과 시 가장 오래된(LRU) 항목이 제거된다', () => {
    const cache = new LookupCache(3);

    cache.set('A', makeOkResult(['A']));
    cache.set('B', makeOkResult(['B']));
    cache.set('C', makeOkResult(['C']));
    expect(cache.size).toBe(3);

    // 4번째 삽입 → A(LRU) 제거
    cache.set('D', makeOkResult(['D']));

    expect(cache.size).toBe(3);
    expect(cache.get('A')).toBeUndefined(); // A 제거됨
    expect(cache.get('B')).toBeDefined();
    expect(cache.get('C')).toBeDefined();
    expect(cache.get('D')).toBeDefined();
  });

  it('get이 LRU 순서를 갱신한다', () => {
    const cache = new LookupCache(3);

    cache.set('A', makeOkResult(['A']));
    cache.set('B', makeOkResult(['B']));
    cache.set('C', makeOkResult(['C']));

    // A를 get → A가 MRU(끝)으로 이동. 순서: B, C, A
    cache.get('A');

    // 4번째 삽입 → B(LRU) 제거 (A는 최근 참조됐으므로 유지)
    cache.set('D', makeOkResult(['D']));

    expect(cache.get('B')).toBeUndefined(); // B 제거됨
    expect(cache.get('A')).toBeDefined();   // A 유지
    expect(cache.get('C')).toBeDefined();   // C 유지
    expect(cache.get('D')).toBeDefined();   // D 유지
  });

  it('기존 키를 set으로 덮어쓰면 LRU 순서가 MRU로 갱신된다', () => {
    const cache = new LookupCache(3);

    cache.set('A', makeOkResult(['A']));
    cache.set('B', makeOkResult(['B']));
    cache.set('C', makeOkResult(['C']));

    // A를 다시 set → A가 MRU로 이동. 순서: B, C, A
    const updatedResult = makeOkResult(['A-updated']);
    cache.set('A', updatedResult);

    // 4번째 삽입 → B(LRU) 제거
    cache.set('D', makeOkResult(['D']));

    expect(cache.get('B')).toBeUndefined(); // B 제거됨
    expect(cache.get('A')).toBe(updatedResult); // A는 갱신된 값 유지
  });

  it('maxSize=200 기본값: 200개까지 모두 보존된다', () => {
    const cache = new LookupCache(); // 기본 200

    for (let i = 0; i < 200; i++) {
      cache.set(`char-${i}`, makeOkResult([`char-${i}`]));
    }

    expect(cache.size).toBe(200);
    expect(cache.get('char-0')).toBeDefined();
    expect(cache.get('char-199')).toBeDefined();
  });
});

// ─── 배열 구조 유지 ───────────────────────────────────────────────────────────

describe('배열 구조 유지', () => {
  it('후보 1개짜리 배열도 배열로 유지된다', () => {
    const cache = new LookupCache();
    const result = makeOkResult(['단독후보']);

    cache.set('단독후보', result);

    const retrieved = cache.get('단독후보');
    expect(retrieved?.status).toBe('ok');
    if (retrieved?.status !== 'ok') return;

    expect(Array.isArray(retrieved.data)).toBe(true);
    expect(retrieved.data).toHaveLength(1);
  });

  it('각 ScrapedCharacter의 fetchedAt이 Date 인스턴스로 유지된다', () => {
    const cache = new LookupCache();
    const result = makeOkResult(['캐릭터A', '캐릭터B']);

    cache.set('캐릭터A', result);

    const retrieved = cache.get('캐릭터A');
    if (retrieved?.status !== 'ok') return;

    for (const char of retrieved.data) {
      expect(char.fetchedAt).toBeInstanceOf(Date);
    }
  });
});
