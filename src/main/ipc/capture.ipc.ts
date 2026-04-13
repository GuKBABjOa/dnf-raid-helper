/**
 * capture.ipc.ts — 'capture:run' IPC 핸들러
 *
 * 의존: pipeline/pipeline.ts, ocr/, scraper/, config/defaults.ts
 * 사용처: main/index.ts (registerCaptureIpc 호출)
 *
 * 책임 범위:
 *   - 'capture:run' IPC 채널 등록
 *   - PipelineDeps 조립 (OCR 어댑터 + cache + lookup + config 주입)
 *   - runPipeline 호출 및 PipelineResult 반환
 *
 * 책임 밖:
 *   - OCR 엔진 구현 (ocr/ 담당)
 *   - 캐시 TTL 정책 (cache.ts 담당)
 *   - 후보 선택·판단 — 하지 않는다 (disambiguator가 정렬만 수행)
 */

import { ipcMain, screen } from 'electron';
import type { LookupCache } from '../../scraper/cache';
import { runPipeline } from '../../pipeline/pipeline';
import { captureScreen } from '../../ocr/capture';
import { preprocessImage } from '../../ocr/preprocess';
import { recognizeText } from '../../ocr/recognize';
import { parseOcrText } from '../../ocr/ocrParser';
import { buildSearchUrl } from '../../scraper/dunjiadam';
import { parseSearchPage } from '../../scraper/parser';
import { fetchHtmlWithBrowser } from '../../scraper/browserFetcher';
import type { LookupResult } from '../../types/lookup';
import { DEFAULT_RAID_CONFIG, DEFAULT_SCORER_CONFIG } from '../../config/defaults';
import type { CaptureRunRequest, CaptureRunResponse } from '../../types/ipc';
import type { PipelineTrigger } from '../../types/pipeline';

// ─── browserLookup ────────────────────────────────────────────────────────────

/**
 * BrowserWindow 기반 lookup 구현체.
 * 던담은 CSR 앱이므로 단순 fetch 대신 실제 브라우저로 로드해 HTML을 추출한다.
 */
async function browserLookup(name: string): Promise<LookupResult> {
  const url = buildSearchUrl(name);
  let html: string;
  try {
    html = await fetchHtmlWithBrowser(url);
  } catch (err) {
    console.error('[browserLookup] 로드 실패:', err);
    return { status: 'failed', name, reason: 'NETWORK_ERROR', attemptedAt: new Date() };
  }

  const parsed = parseSearchPage(html);
  if (parsed.kind === 'not_found' || parsed.items.length === 0) {
    console.log('[browserLookup] not_found:', name);
    return { status: 'failed', name, reason: 'NOT_FOUND', attemptedAt: new Date() };
  }

  const fetchedAt = new Date();
  console.log('[browserLookup] 후보', parsed.items.length, '명 발견');
  return { status: 'ok', data: parsed.items.map((item) => ({ ...item, fetchedAt })) };
}

// ─── registerCaptureIpc ───────────────────────────────────────────────────────

/**
 * 'capture:run' IPC 핸들러를 등록한다.
 * cache 싱글톤은 main/index.ts에서 생성해 주입받는다.
 */
export function registerCaptureIpc(cache: LookupCache): void {
  ipcMain.handle(
    'capture:run',
    async (_event, req: CaptureRunRequest): Promise<CaptureRunResponse> => {
      const trigger: PipelineTrigger = {
        source: 'manual',
        region: req.region,
        triggeredAt: new Date(),
      };

      // DPI 스케일링 보정: Electron 논리 픽셀 → screenshot 물리 픽셀
      const scaleFactor = screen.getPrimaryDisplay().scaleFactor;
      const region = {
        x: req.region.x * scaleFactor,
        y: req.region.y * scaleFactor,
        width: req.region.width * scaleFactor,
        height: req.region.height * scaleFactor,
      };
      console.log('[capture:run] IPC 수신 region=', req.region, '→ scaled=', region, 'scaleFactor=', scaleFactor);
      trigger.region = region;

      const pipelineResult = await runPipeline(trigger, {
        capture: captureScreen,
        preprocess: preprocessImage,
        recognize: recognizeText,
        parseOcr: (raw) => {
          console.log('[parseOcr] 원시 텍스트:\n', raw);
          const result = parseOcrText(raw);
          console.log('[parseOcr] 결과:', result);
          return result;
        },
        cache,
        lookup: browserLookup,
        raidConfig: DEFAULT_RAID_CONFIG,
        scorerConfig: DEFAULT_SCORER_CONFIG,
      });

      console.log('[pipeline] 최종 결과 status=', pipelineResult.status);
      return pipelineResult;
    },
  );
}
