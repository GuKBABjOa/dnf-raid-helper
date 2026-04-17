/**
 * browserFetcher.ts — Electron BrowserWindow 기반 HTML fetcher
 *
 * 의존: electron (BrowserWindow), types/lookup.ts
 * 사용처: capture.ipc.ts (browserLookup에서 사용)
 *
 * 배경:
 *   던담(dundam.xyz)은 React CSR 앱이라 단순 fetch로는 JS 실행 전
 *   빈 HTML 껍데기(~3KB)만 반환된다.
 *   Electron의 숨김 BrowserWindow를 활용해 실제 브라우저처럼
 *   페이지를 로드하고 JS 렌더링 완료 후 HTML을 추출한다.
 *
 * 설계:
 *   - BrowserWindow 싱글톤: 최초 호출 시 생성, 이후 재사용 (열고 닫는 오버헤드 제거)
 *   - 렌더링 완료 감지: did-finish-load 후 `.sr-result` 엘리먼트 폴링 (최대 8초)
 *   - 동시 호출 직렬화: 한 번에 하나의 URL만 로드 (큐 없이 단순 lock)
 *
 * 정리:
 *   앱 종료 시 destroyBrowserFetcher()를 호출한다 (main/index.ts).
 */

import { BrowserWindow } from 'electron';

let fetcherWindow: BrowserWindow | null = null;
let isBusy = false;

type SearchRenderSnapshot = {
  hasResultContainer: boolean;
  hasItems: boolean;
  resultName: string;
  htmlLength: number;
};

type SearchRenderState =
  | { kind: 'has_items'; snapshot: SearchRenderSnapshot }
  | { kind: 'settled_empty'; snapshot: SearchRenderSnapshot }
  | { kind: 'timeout'; snapshot: SearchRenderSnapshot | null };

// ─── 초기화 ───────────────────────────────────────────────────────────────────

function getOrCreateWindow(): BrowserWindow {
  if (fetcherWindow && !fetcherWindow.isDestroyed()) return fetcherWindow;

  fetcherWindow = new BrowserWindow({
    show: false,          // 화면에 표시하지 않음
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      javascript: true,
    },
  });

  // 창이 예기치 않게 닫히면 참조 초기화
  fetcherWindow.on('closed', () => {
    fetcherWindow = null;
    isBusy = false;
  });

  return fetcherWindow;
}

// ─── fetchHtmlWithBrowser ─────────────────────────────────────────────────────

/**
 * 숨김 BrowserWindow로 URL을 로드하고 렌더링 완료 후 HTML을 반환한다.
 *
 * 렌더링 완료 판정:
 *   `did-finish-load` 이벤트 발생 후,
 *   `.sr-result` 엘리먼트가 DOM에 나타날 때까지 최대 8초 폴링.
 *   8초 내에 나타나지 않으면 그 시점의 HTML을 그대로 반환한다
 *   (파서가 not_found로 처리하도록).
 *
 * @throws Error - 페이지 로드 자체가 실패한 경우
 */
export async function fetchHtmlWithBrowser(url: string): Promise<string> {
  if (isBusy) {
    // 동시 호출 방어: 직전 요청이 끝날 때까지 대기
    await waitUntil(() => !isBusy, 10_000);
  }

  isBusy = true;
  const win = getOrCreateWindow();

  try {
    console.log('[browserFetcher] 로드 시작:', url);

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('페이지 로드 타임아웃')), 15_000);

      win.webContents.once('did-finish-load', () => {
        clearTimeout(timeout);
        resolve();
      });

      win.webContents.once('did-fail-load', (_e, code, desc) => {
        clearTimeout(timeout);
        reject(new Error(`페이지 로드 실패: ${code} ${desc}`));
      });

      win.loadURL(url);
    });

    const expectedName = extractSearchName(url);
    const renderState = await waitForSearchResultState(win, expectedName, 8_000);
    console.log(
      '[browserFetcher] 검색 결과 렌더 상태:',
      renderState.kind,
      renderState.snapshot,
    );

    const html: string = await win.webContents.executeJavaScript(
      'document.documentElement.outerHTML',
    );

    console.log('[browserFetcher] HTML 추출 완료, 크기:', html.length);
    return html;
  } finally {
    isBusy = false;
  }
}

// ─── destroyBrowserFetcher ────────────────────────────────────────────────────

/**
 * 숨김 BrowserWindow를 닫고 정리한다.
 * 앱 종료 시 main/index.ts의 will-quit에서 호출.
 */
export function destroyBrowserFetcher(): void {
  if (fetcherWindow && !fetcherWindow.isDestroyed()) {
    fetcherWindow.destroy();
    fetcherWindow = null;
  }
}

// ─── 내부 헬퍼 ───────────────────────────────────────────────────────────────

/** 조건 함수가 true가 될 때까지 폴링. timeoutMs 초과 시 false 반환. */
async function waitUntil(condition: () => boolean, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (condition()) return true;
    await sleep(100);
  }
  return false;
}

/**
 * BrowserWindow 내에서 selector가 DOM에 나타날 때까지 폴링.
 * 나타나면 true, 타임아웃이면 false.
 */
export async function pollForElement(win: BrowserWindow, selector: string, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const found: boolean = await win.webContents.executeJavaScript(
        `!!document.querySelector(${JSON.stringify(selector)})`,
      );
      if (found) return true;
    } catch {
      // executeJavaScript 실패 (페이지 전환 중 등) → 계속 폴링
    }
    await sleep(200);
  }
  return false;
}

async function waitForSearchResultState(
  win: BrowserWindow,
  expectedName: string | null,
  timeoutMs: number,
): Promise<SearchRenderState> {
  const start = Date.now();
  let previousHtmlLength = -1;
  let stableCount = 0;
  let lastSnapshot: SearchRenderSnapshot | null = null;

  while (Date.now() - start < timeoutMs) {
    try {
      const snapshot = (await win.webContents.executeJavaScript(`
        (() => {
          const resultRoot = document.querySelector('.sr-result');
          const items = resultRoot?.querySelectorAll('.scon') ?? [];
          const resultName =
            document.querySelector('.result-intro .re-nick span')?.textContent?.trim() ?? '';
          const htmlLength = resultRoot?.innerHTML?.length ?? 0;

          return {
            hasResultContainer: !!resultRoot,
            hasItems: items.length > 0,
            resultName,
            htmlLength,
          };
        })()
      `)) as SearchRenderSnapshot;

      lastSnapshot = snapshot;

      if (snapshot.hasItems) {
        return { kind: 'has_items', snapshot };
      }

      const nameReady = !expectedName || snapshot.resultName === expectedName;
      const htmlStable = snapshot.htmlLength === previousHtmlLength;
      stableCount = htmlStable ? stableCount + 1 : 0;
      previousHtmlLength = snapshot.htmlLength;

      // React CSR 특성상 `.sr-result` 컨테이너만 먼저 생기고 내용이 뒤늦게 들어온다.
      // 검색어가 반영되고 빈 결과 DOM이 여러 번 동일하면 not_found로 해석할 만큼 안정화된 것으로 본다.
      if (
        snapshot.hasResultContainer &&
        nameReady &&
        !snapshot.hasItems &&
        stableCount >= 4
      ) {
        return { kind: 'settled_empty', snapshot };
      }
    } catch {
      // executeJavaScript 실패 (페이지 전환 중 등) 시 계속 대기
    }

    await sleep(200);
  }

  return { kind: 'timeout', snapshot: lastSnapshot };
}

function extractSearchName(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get('name');
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
