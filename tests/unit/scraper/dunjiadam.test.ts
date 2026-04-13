import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSearchUrl, lookup } from '../../../src/scraper/dunjiadam';
import { fetchHtml, FetchError } from '../../../src/scraper/fetcher';
import { parseSearchPage } from '../../../src/scraper/parser';
import type { RawSearchItem } from '../../../src/scraper/parser';

// fetchHtml만 mock으로 교체하고 FetchError는 실제 클래스를 그대로 사용한다.
vi.mock('../../../src/scraper/fetcher', async (importActual) => {
  const actual = await importActual<typeof import('../../../src/scraper/fetcher')>();
  return { ...actual, fetchHtml: vi.fn() };
});

// parseSearchPage만 mock으로 교체한다.
vi.mock('../../../src/scraper/parser', async (importActual) => {
  const actual = await importActual<typeof import('../../../src/scraper/parser')>();
  return { ...actual, parseSearchPage: vi.fn() };
});

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────

/** parseSearchPage가 반환할 최소 RawSearchItem stub */
function makeItem(name: string): RawSearchItem {
  return {
    name,
    server: '카인',
    jobName: '眞 넨마스터',
    adventureName: null,
    renown: 100_000,
    stats: { type: 'damage', primaryValue: 100_000_000_000, displayLabel: '1000 억' },
    visual: { fullBodyImageUrl: null, jobIconUrl: null },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ─── buildSearchUrl ───────────────────────────────────────────────────────────

describe('buildSearchUrl', () => {
  it('ASCII 이름은 encodeURIComponent를 거쳐 URL에 포함된다', () => {
    expect(buildSearchUrl('test')).toBe(
      'https://dundam.xyz/search?server=all&name=test',
    );
  });

  it('한글 이름은 percent-encoded URL이 된다', () => {
    expect(buildSearchUrl('아이유')).toBe(
      'https://dundam.xyz/search?server=all&name=%EC%95%84%EC%9D%B4%EC%9C%A0',
    );
  });

  it('공백과 특수문자도 encodeURIComponent 처리된다', () => {
    const url = buildSearchUrl('test name+1');
    expect(url).toBe(
      'https://dundam.xyz/search?server=all&name=test%20name%2B1',
    );
  });

  it('server=all이 항상 포함된다', () => {
    expect(buildSearchUrl('x')).toContain('server=all');
  });
});

// ─── lookup — 성공 ────────────────────────────────────────────────────────────

describe('lookup — 성공', () => {
  it('items 2개 → status: ok, data.length === 2', async () => {
    vi.mocked(fetchHtml).mockResolvedValue('<html>mock</html>');
    vi.mocked(parseSearchPage).mockReturnValue({
      kind: 'results',
      items: [makeItem('캐릭터A'), makeItem('캐릭터B')],
    });

    const result = await lookup('아이유');
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.data).toHaveLength(2);
  });

  it('각 item에 fetchedAt(Date)이 주입된다', async () => {
    vi.mocked(fetchHtml).mockResolvedValue('<html>mock</html>');
    vi.mocked(parseSearchPage).mockReturnValue({
      kind: 'results',
      items: [makeItem('캐릭터A'), makeItem('캐릭터B')],
    });

    const result = await lookup('아이유');
    if (result.status !== 'ok') return;
    for (const char of result.data) {
      expect(char.fetchedAt).toBeInstanceOf(Date);
    }
  });

  it('모든 item의 fetchedAt이 동일한 Date 인스턴스다', async () => {
    vi.mocked(fetchHtml).mockResolvedValue('<html>mock</html>');
    vi.mocked(parseSearchPage).mockReturnValue({
      kind: 'results',
      items: [makeItem('캐릭터A'), makeItem('캐릭터B')],
    });

    const result = await lookup('아이유');
    if (result.status !== 'ok') return;
    expect(result.data[0].fetchedAt).toBe(result.data[1].fetchedAt);
  });

  it('buildSearchUrl로 생성된 URL로 fetchHtml을 호출한다', async () => {
    vi.mocked(fetchHtml).mockResolvedValue('<html>mock</html>');
    vi.mocked(parseSearchPage).mockReturnValue({
      kind: 'results',
      items: [makeItem('캐릭터A')],
    });

    await lookup('아이유');
    expect(vi.mocked(fetchHtml)).toHaveBeenCalledWith(
      'https://dundam.xyz/search?server=all&name=%EC%95%84%EC%9D%B4%EC%9C%A0',
    );
  });
});

// ─── lookup — NOT_FOUND ───────────────────────────────────────────────────────

describe('lookup — not_found', () => {
  it('parseSearchPage → not_found 이면 FailedLookup(NOT_FOUND)', async () => {
    vi.mocked(fetchHtml).mockResolvedValue('<html>mock</html>');
    vi.mocked(parseSearchPage).mockReturnValue({ kind: 'not_found' });

    const result = await lookup('없는캐릭터');
    expect(result.status).toBe('failed');
    if (result.status !== 'failed') return;
    expect(result.reason).toBe('NOT_FOUND');
    expect(result.name).toBe('없는캐릭터');
  });

  it('FailedLookup에 attemptedAt(Date)이 포함된다', async () => {
    vi.mocked(fetchHtml).mockResolvedValue('<html>mock</html>');
    vi.mocked(parseSearchPage).mockReturnValue({ kind: 'not_found' });

    const result = await lookup('없는캐릭터');
    if (result.status !== 'failed') return;
    expect(result.attemptedAt).toBeInstanceOf(Date);
  });
});

// ─── lookup — PARSE_ERROR ─────────────────────────────────────────────────────

describe('lookup — parse_error', () => {
  it('results.items가 빈 배열이면 FailedLookup(PARSE_ERROR)', async () => {
    vi.mocked(fetchHtml).mockResolvedValue('<html>mock</html>');
    vi.mocked(parseSearchPage).mockReturnValue({ kind: 'results', items: [] });

    const result = await lookup('테스트');
    expect(result.status).toBe('failed');
    if (result.status !== 'failed') return;
    expect(result.reason).toBe('PARSE_ERROR');
  });
});

// ─── lookup — FetchError 전파 ─────────────────────────────────────────────────

describe('lookup — FetchError 전파', () => {
  it('FetchError(NETWORK_ERROR) → FailedLookup(NETWORK_ERROR)', async () => {
    vi.mocked(fetchHtml).mockRejectedValue(new FetchError('NETWORK_ERROR'));

    const result = await lookup('테스트');
    expect(result.status).toBe('failed');
    if (result.status !== 'failed') return;
    expect(result.reason).toBe('NETWORK_ERROR');
  });

  it('FetchError(TIMEOUT) → FailedLookup(TIMEOUT)', async () => {
    vi.mocked(fetchHtml).mockRejectedValue(new FetchError('TIMEOUT'));

    const result = await lookup('테스트');
    if (result.status !== 'failed') return;
    expect(result.reason).toBe('TIMEOUT');
  });

  it('FetchError(RATE_LIMITED) → FailedLookup(RATE_LIMITED)', async () => {
    vi.mocked(fetchHtml).mockRejectedValue(new FetchError('RATE_LIMITED'));

    const result = await lookup('테스트');
    if (result.status !== 'failed') return;
    expect(result.reason).toBe('RATE_LIMITED');
  });

  it('예상치 못한 에러도 FailedLookup(NETWORK_ERROR)으로 감싼다', async () => {
    vi.mocked(fetchHtml).mockRejectedValue(new Error('Unknown'));

    const result = await lookup('테스트');
    expect(result.status).toBe('failed');
    if (result.status !== 'failed') return;
    expect(result.reason).toBe('NETWORK_ERROR');
  });
});
