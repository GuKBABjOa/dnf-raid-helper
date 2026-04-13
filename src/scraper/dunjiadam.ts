/**
 * dunjiadam.ts — 던담 스크래퍼 orchestration 레이어
 *
 * 의존: fetcher.ts, parser.ts, types/lookup.ts
 * 사용처:
 *   - Main: pipeline/pipeline.ts (lookup 호출)
 *   - Tests: tests/unit/scraper/dunjiadam.test.ts
 *
 * 책임 범위:
 *   - buildSearchUrl: 검색 URL 생성 (encodeURIComponent 처리)
 *   - lookup: fetchHtml → parseSearchPage 조합, fetchedAt 주입, FetchError → FailedLookup 변환
 *
 * 책임 밖:
 *   - 후보 선택 금지 (ranker 담당)
 *   - cache 접근 금지
 *   - HTML 파싱 금지 (parser.ts 담당)
 *   - HTTP 전송 금지 (fetcher.ts 담당)
 *
 * fetchedAt 주입 정책:
 *   fetch 완료 직후 단일 Date 인스턴스를 생성해 모든 items에 동일하게 주입한다.
 *   items 간 fetchedAt이 일치해야 캐시 정책(ADR-017) 적용이 일관된다.
 */

import { fetchHtml, FetchError } from './fetcher';
import { parseSearchPage } from './parser';
import type { LookupResult, FailedLookup } from '../types/lookup';

const DUNDAM_BASE = 'https://dundam.xyz';

// ─── buildSearchUrl ───────────────────────────────────────────────────────────

/**
 * 던담 검색 URL을 생성한다.
 *
 * @param name - 검색할 캐릭터명. encodeURIComponent 처리됨.
 * @returns `https://dundam.xyz/search?server=all&name=<encoded>`
 */
export function buildSearchUrl(name: string): string {
  return `${DUNDAM_BASE}/search?server=all&name=${encodeURIComponent(name)}`;
}

// ─── lookup ───────────────────────────────────────────────────────────────────

/**
 * 캐릭터명으로 던담을 조회해 후보 전체를 반환한다.
 *
 * 성공:  { status: 'ok', data: ScrapedCharacter[] }  — 후보 배열, ranker가 선택
 * 실패:  FailedLookup — reason으로 실패 원인 구분
 *
 * reason 매핑:
 *   FetchError(TIMEOUT)       → TIMEOUT
 *   FetchError(RATE_LIMITED)  → RATE_LIMITED
 *   FetchError(NETWORK_ERROR) → NETWORK_ERROR
 *   parseSearchPage not_found → NOT_FOUND
 *   results.items 빈 배열     → PARSE_ERROR
 */
export async function lookup(name: string): Promise<LookupResult> {
  const url = buildSearchUrl(name);

  let html: string;
  try {
    html = await fetchHtml(url);
  } catch (err) {
    const reason =
      err instanceof FetchError ? err.reason : ('NETWORK_ERROR' as const);
    return failed(name, reason);
  }

  const parsed = parseSearchPage(html);

  if (parsed.kind === 'not_found') {
    return failed(name, 'NOT_FOUND');
  }

  if (parsed.items.length === 0) {
    return failed(name, 'PARSE_ERROR');
  }

  const fetchedAt = new Date();
  return {
    status: 'ok',
    data: parsed.items.map((item) => ({ ...item, fetchedAt })),
  };
}

// ─── Internal helper ──────────────────────────────────────────────────────────

function failed(name: string, reason: FailedLookup['reason']): FailedLookup {
  return { status: 'failed', name, reason, attemptedAt: new Date() };
}
