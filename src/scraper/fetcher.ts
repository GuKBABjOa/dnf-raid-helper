/**
 * fetcher.ts — HTTP transport 계층
 *
 * 의존: types/lookup.ts (LookupErrorReason)
 * 사용처:
 *   - Main: scraper/dunjiadam.ts (fetchHtml 호출)
 *   - Tests: tests/unit/scraper/fetcher.test.ts
 *
 * 책임 범위:
 *   - HTTP 요청 실행 및 응답 HTML 문자열 반환
 *   - timeout / 4xx / 5xx / network failure → FetchError로 변환
 *
 * 책임 밖:
 *   - HTML 파싱 금지
 *   - NOT_FOUND 판별 금지 (던담은 캐릭터 없음도 200으로 반환 — parser가 담당)
 *   - 후보 선택 금지
 *   - fetchedAt 주입 금지
 *   - 캐시 접근 금지
 *
 * 404 정책:
 *   던담은 캐릭터가 없어도 HTTP 200 + 빈 sr-result HTML을 반환한다.
 *   HTTP 404는 URL 구조 오류 또는 서버 라우팅 실패 — transport 오류로 분류.
 *   따라서 404 포함 모든 non-2xx / non-429 → NETWORK_ERROR.
 */

import type { LookupErrorReason } from '../types/lookup';

export const DEFAULT_TIMEOUT_MS = 3_000;

// ─── FetchError ───────────────────────────────────────────────────────────────

/**
 * fetchHtml이 throw하는 에러. reason으로 LookupErrorReason을 포함한다.
 * dunjiadam.ts가 이 에러를 catch해서 FailedLookup으로 변환한다.
 *
 * reason 매핑:
 *   AbortError (timeout)    → TIMEOUT
 *   HTTP 429                → RATE_LIMITED
 *   그 외 HTTP 오류 / throw  → NETWORK_ERROR
 */
export class FetchError extends Error {
  readonly reason: LookupErrorReason;

  constructor(reason: LookupErrorReason) {
    super(`FetchError: ${reason}`);
    this.name = 'FetchError';
    this.reason = reason;
  }
}

// ─── fetchHtml ────────────────────────────────────────────────────────────────

/**
 * URL → HTML 문자열.
 *
 * @param url - 요청할 URL
 * @param timeoutMs - 타임아웃(ms). 기본값 DEFAULT_TIMEOUT_MS(3000).
 * @throws {FetchError} transport 오류 시
 */
export async function fetchHtml(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'text/html,application/xhtml+xml' },
    });

    if (response.status === 429) throw new FetchError('RATE_LIMITED');
    if (!response.ok) throw new FetchError('NETWORK_ERROR');

    return await response.text();
  } catch (err) {
    if (err instanceof FetchError) throw err;
    if (err instanceof Error && err.name === 'AbortError') throw new FetchError('TIMEOUT');
    throw new FetchError('NETWORK_ERROR');
  } finally {
    // 성공/실패/abort 모든 경로에서 timer를 정리한다
    clearTimeout(timer);
  }
}
