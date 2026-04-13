/**
 * cache.ts — LookupResult 인메모리 캐시
 *
 * 의존: types/lookup.ts
 * 사용처: pipeline/pipeline.ts (cache.get / cache.set)
 *
 * 캐시 정책 (ADR-017):
 *   ok                                    → 세션 유지 (expiresAt: null)
 *   failed, reason: NOT_FOUND             → 60초 TTL
 *   failed, reason: 그 외 (NETWORK_ERROR /
 *     TIMEOUT / RATE_LIMITED / PARSE_ERROR) → 캐시하지 않음 (일시적 오류)
 *
 * LRU 구현:
 *   Map 삽입 순서를 활용한다.
 *   - get: delete + 재삽입 → MRU(끝) 위치로 이동
 *   - set: capacity 초과 시 Map.keys().next().value(LRU, 첫 번째) 제거
 *
 * 캐시 값이 ScrapedCharacter[]인 이유:
 *   scraper는 후보 전체를 배열로 반환한다.
 *   cache는 LookupResult 그대로 저장해 pipeline이 히트 시 배열을 그대로 쓸 수 있게 한다.
 *   배열 변형이나 후보 선택은 cache의 책임이 아니다.
 */

import type { LookupResult } from '../types/lookup';

export const NOT_FOUND_TTL_MS = 60_000;

// ─── Internal ────────────────────────────────────────────────────────────────

interface CacheEntry {
  result: LookupResult;
  expiresAt: number | null; // null = 세션 유지, number = Unix ms 만료 시각
}

/**
 * 이 결과를 캐시해야 하는지 결정한다.
 *
 * ok         → 캐시 (세션 유지)
 * NOT_FOUND  → 캐시 (60초 TTL로 재요청 방지)
 * 그 외 실패 → 미캐시 (NETWORK_ERROR / TIMEOUT / RATE_LIMITED / PARSE_ERROR는 일시적 오류)
 */
function isCacheable(result: LookupResult): boolean {
  if (result.status === 'ok') return true;
  if (result.status === 'failed' && result.reason === 'NOT_FOUND') return true;
  return false;
}

/**
 * 캐시 항목의 expiresAt을 계산한다.
 * isCacheable()을 통과한 결과에만 호출한다.
 *
 * ok         → null (만료 없음, 세션 유지)
 * NOT_FOUND  → now + NOT_FOUND_TTL_MS (60초)
 */
function computeExpiresAt(result: LookupResult): number | null {
  if (result.status === 'ok') return null;
  if (result.status === 'failed' && result.reason === 'NOT_FOUND') {
    return Date.now() + NOT_FOUND_TTL_MS;
  }
  return null;
}

// ─── LookupCache ──────────────────────────────────────────────────────────────

export class LookupCache {
  private readonly maxSize: number;
  private readonly map = new Map<string, CacheEntry>();

  /**
   * @param maxSize - 최대 항목 수. 기본값 200. 테스트에서 재정의 가능.
   */
  constructor(maxSize = 200) {
    this.maxSize = maxSize;
  }

  /**
   * 캐시에서 name에 해당하는 LookupResult를 반환한다.
   * 만료된 항목은 제거 후 undefined 반환.
   * 유효한 항목은 LRU 위치를 MRU(끝)으로 갱신한다.
   */
  get(name: string): LookupResult | undefined {
    const entry = this.map.get(name);
    if (!entry) return undefined;

    // TTL 만료 확인
    if (entry.expiresAt !== null && Date.now() >= entry.expiresAt) {
      this.map.delete(name);
      return undefined;
    }

    // LRU 갱신: 삭제 후 재삽입 → Map 끝(MRU)으로 이동
    this.map.delete(name);
    this.map.set(name, entry);

    return entry.result;
  }

  /**
   * LookupResult를 name 키로 캐시에 저장한다.
   * 캐시 불가 결과(NETWORK_ERROR 등)는 무시한다.
   * 기존 키가 있으면 덮어쓴다 (LRU 위치 갱신 포함).
   * 최대 크기 초과 시 LRU 항목(Map 첫 번째)을 제거한다.
   */
  set(name: string, result: LookupResult): void {
    if (!isCacheable(result)) return;

    // 기존 키 제거 (LRU 순서 재정렬을 위해)
    if (this.map.has(name)) {
      this.map.delete(name);
    }

    this.map.set(name, {
      result,
      expiresAt: computeExpiresAt(result),
    });

    // 최대 크기 초과 시 LRU(첫 번째 키) 제거
    if (this.map.size > this.maxSize) {
      const lruKey = this.map.keys().next().value as string;
      this.map.delete(lruKey);
    }
  }

  /** 현재 캐시 항목 수. 테스트 및 진단용. */
  get size(): number {
    return this.map.size;
  }
}
