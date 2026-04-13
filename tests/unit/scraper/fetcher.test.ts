import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchHtml, FetchError, DEFAULT_TIMEOUT_MS } from '../../../src/scraper/fetcher';

// 매 테스트 후 글로벌 stub과 fake timer를 원상 복구한다
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────

function stubFetchOk(html: string): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(html),
    }),
  );
}

function stubFetchStatus(status: number): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      text: vi.fn().mockResolvedValue(''),
    }),
  );
}

function stubFetchReject(error: Error): void {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(error));
}

/**
 * AbortSignal을 실제로 감지해서 AbortError로 reject하는 mock.
 * fake timer와 함께 사용해서 timeout 흐름을 재현한다.
 */
function stubFetchHanging(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init?: RequestInit) => {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    }),
  );
}

// ─── 성공 ─────────────────────────────────────────────────────────────────────

describe('fetchHtml — 성공', () => {
  it('200 응답 → HTML 문자열을 반환한다', async () => {
    stubFetchOk('<html>던담 페이지</html>');
    const result = await fetchHtml('https://dundam.xyz/find?name=test');
    expect(result).toBe('<html>던담 페이지</html>');
  });

  it('요청 시 전달된 URL을 그대로 사용한다', async () => {
    stubFetchOk('');
    const mockFetch = vi.mocked(globalThis.fetch);
    await fetchHtml('https://dundam.xyz/find?name=아이유');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://dundam.xyz/find?name=아이유',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});

// ─── 에러 분류 ────────────────────────────────────────────────────────────────

describe('fetchHtml — 429 → RATE_LIMITED', () => {
  it('HTTP 429 응답 → FetchError(RATE_LIMITED)를 throw한다', async () => {
    stubFetchStatus(429);
    await expect(fetchHtml('https://dundam.xyz/find?name=test')).rejects.toMatchObject({
      reason: 'RATE_LIMITED',
    });
  });

  it('throw된 에러가 FetchError 인스턴스다', async () => {
    stubFetchStatus(429);
    await expect(fetchHtml('https://dundam.xyz/find?name=test')).rejects.toBeInstanceOf(
      FetchError,
    );
  });
});

describe('fetchHtml — 5xx → NETWORK_ERROR', () => {
  it('HTTP 500 응답 → FetchError(NETWORK_ERROR)를 throw한다', async () => {
    stubFetchStatus(500);
    await expect(fetchHtml('https://dundam.xyz/find?name=test')).rejects.toMatchObject({
      reason: 'NETWORK_ERROR',
    });
  });

  it('HTTP 503 응답 → FetchError(NETWORK_ERROR)를 throw한다', async () => {
    stubFetchStatus(503);
    await expect(fetchHtml('https://dundam.xyz/find?name=test')).rejects.toMatchObject({
      reason: 'NETWORK_ERROR',
    });
  });
});

describe('fetchHtml — 4xx → NETWORK_ERROR', () => {
  /**
   * 404 정책:
   * 던담은 캐릭터가 없어도 HTTP 200 + 빈 sr-result HTML을 반환한다.
   * HTTP 404는 URL 구조 자체가 잘못됐거나 서버 라우팅 실패 — transport 오류.
   * NOT_FOUND 판별은 parser(sr-result 비어있음 확인)가 담당하므로
   * fetcher는 404를 NETWORK_ERROR로 처리한다.
   */
  it('HTTP 404 응답 → FetchError(NETWORK_ERROR)를 throw한다', async () => {
    stubFetchStatus(404);
    await expect(fetchHtml('https://dundam.xyz/find?name=test')).rejects.toMatchObject({
      reason: 'NETWORK_ERROR',
    });
  });

  it('HTTP 403 응답 → FetchError(NETWORK_ERROR)를 throw한다', async () => {
    stubFetchStatus(403);
    await expect(fetchHtml('https://dundam.xyz/find?name=test')).rejects.toMatchObject({
      reason: 'NETWORK_ERROR',
    });
  });
});

describe('fetchHtml — fetch reject → NETWORK_ERROR', () => {
  it('fetch가 TypeError를 throw하면 → FetchError(NETWORK_ERROR)를 throw한다', async () => {
    stubFetchReject(new TypeError('Failed to fetch'));
    await expect(fetchHtml('https://dundam.xyz/find?name=test')).rejects.toMatchObject({
      reason: 'NETWORK_ERROR',
    });
  });

  it('fetch가 알 수 없는 에러를 throw해도 → FetchError(NETWORK_ERROR)로 감싼다', async () => {
    stubFetchReject(new Error('Unknown network error'));
    await expect(fetchHtml('https://dundam.xyz/find?name=test')).rejects.toBeInstanceOf(
      FetchError,
    );
  });
});

// ─── Timeout ──────────────────────────────────────────────────────────────────

describe('fetchHtml — timeout → TIMEOUT', () => {
  it('timeoutMs 초과 시 FetchError(TIMEOUT)을 throw한다', async () => {
    vi.useFakeTimers();
    stubFetchHanging();

    const promise = fetchHtml('https://dundam.xyz/find?name=test', 1_000);

    // assertion을 먼저 생성하면 Vitest가 promise에 catch 핸들러를 즉시 attach한다.
    // 이후 타이머를 진행해도 rejection이 이미 핸들링된 상태이므로
    // PromiseRejectionHandledWarning이 발생하지 않는다.
    const assertion = expect(promise).rejects.toMatchObject({ reason: 'TIMEOUT' });

    // 1001ms 경과 → setTimeout 콜백 실행 → controller.abort() → AbortError
    await vi.advanceTimersByTimeAsync(1_001);

    await assertion;
  });

  it('timeoutMs 이내에 완료되면 정상 반환한다', async () => {
    vi.useFakeTimers();
    stubFetchOk('<html>fast</html>');

    const promise = fetchHtml('https://dundam.xyz/find?name=test', 1_000);
    // 타이머 진행 없이 즉시 응답 — timeout이 걸리지 않아야 한다
    const result = await promise;

    expect(result).toBe('<html>fast</html>');
  });

  it('기본 timeout은 DEFAULT_TIMEOUT_MS(3000ms)다', () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(3_000);
  });
});

// ─── FetchError 구조 ──────────────────────────────────────────────────────────

describe('FetchError', () => {
  it('reason 필드를 가진다', () => {
    const err = new FetchError('NETWORK_ERROR');
    expect(err.reason).toBe('NETWORK_ERROR');
  });

  it('name이 "FetchError"다', () => {
    const err = new FetchError('TIMEOUT');
    expect(err.name).toBe('FetchError');
  });

  it('Error를 상속한다', () => {
    const err = new FetchError('RATE_LIMITED');
    expect(err).toBeInstanceOf(Error);
  });
});
