/**
 * recognize.ts — OCR 엔진 어댑터 (Tesseract.js, zone 기반)
 *
 * 의존: tesseract.js, sharp, types/ocr.ts, preprocess.ts
 * 사용처: main/ipc/capture.ipc.ts (PipelineDeps.recognize로 주입)
 *
 * 책임 범위:
 *   - Tesseract Worker 싱글톤 관리
 *   - ImageBuffer를 3개 zone으로 크롭 후 각각 OCR
 *   - 태그 구분자 형식의 RawOCRText 반환 (ocrParser.ts가 파싱)
 *
 * 책임 밖:
 *   - 텍스트 파싱 (ocrParser.ts)
 *   - 이미지 전처리 (preprocess.ts)
 *
 * Zone 레이아웃 (DNF 파티 신청창 고정 비율):
 *   캡처 영역 = 사용자가 신청창 카드에 맞게 설정한 고정 영역.
 *   그 안에서 각 행의 상대 위치는 항상 일정하다.
 *
 *   ┌────────────────────────────────────┐  y=0
 *   │ [아바타]  이름        [D/B/S]  직업명 │  ROW1: 0~41%
 *   │          13%~65%     65%~100%      │
 *   ├────────────────────────────────────┤  y≈41%
 *   │ [등급]  코인: N개  피로도: N       │  ROW2: 41~68% (무시)
 *   ├────────────────────────────────────┤  y≈68%
 *   │         명성: NNNNNN              │  ROW3: 68~100%
 *   └────────────────────────────────────┘  y=100%
 *
 *   NAME zone: x=13%~65%, y=0~41%  — 이름 전용 (아바타·아이콘·직업명 배제)
 *   JOB  zone: x=55%~100%, y=0~41% — 직업명 전용 (이름 노이즈 배제)
 *   ROW3 zone: x=0%~100%, y=68~100% — 명성 행 전체
 *
 *   NAME/JOB는 x 범위가 10% 겹침: 아이콘 위치가 고정되지 않아
 *   이름이 오른쪽으로 밀리거나 아이콘이 왼쪽으로 치우칠 경우 대비.
 *
 * 반환 형식 (RawOCRText):
 *   §NAME§<이름 텍스트>
 *   §JOB§<직업명 텍스트>
 *   §ROW3§<명성 텍스트>
 *
 * 언어팩:
 *   kor + chi_tra — 한글/영문/번체한자(眞, 血魔 등) 처리
 *
 * Worker 초기화:
 *   첫 recognize 호출 시 lazy 초기화. 이후 재사용.
 *   앱 종료 시 terminateWorker() 호출 필요 (main/index.ts).
 */

import { createWorker, PSM } from 'tesseract.js';
import type { Worker } from 'tesseract.js';
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ImageBuffer, RawOCRText } from '../types/ocr';


// ─── Zone 비율 상수 ───────────────────────────────────────────────────────────

/** ROW1 세로 범위: 이름 + 직업명 행 */
const ROW1_Y_START = 0.00;
const ROW1_Y_END   = 0.41;

/** ROW3 세로 범위: 명성 행 */
const ROW3_Y_START = 0.68;
const ROW3_Y_END   = 1.00;

/** NAME zone 가로: 아바타(0~13%) 제외, 이름 영역만 */
const NAME_X_START = 0.13;
const NAME_X_END   = 0.65;

/** JOB zone 가로: 역할 아이콘 이후 직업명 영역 */
const JOB_X_START  = 0.55;
const JOB_X_END    = 1.00;

// ─── Worker 싱글톤 ────────────────────────────────────────────────────────────

let worker: Worker | null = null;

async function getWorker(): Promise<Worker> {
  if (worker) return worker;
  worker = await createWorker(['kor', 'chi_tra']);
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SINGLE_LINE,
  });
  return worker;
}

// ─── Zone 크롭 헬퍼 ──────────────────────────────────────────────────────────

interface ZoneBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

function computeZone(
  imgWidth: number,
  imgHeight: number,
  xStart: number,
  yStart: number,
  xEnd: number,
  yEnd: number,
): ZoneBounds {
  const left   = Math.round(imgWidth  * xStart);
  const top    = Math.round(imgHeight * yStart);
  const width  = Math.round(imgWidth  * xEnd) - left;
  const height = Math.round(imgHeight * yEnd) - top;
  return { left, top, width: Math.max(width, 1), height: Math.max(height, 1) };
}

async function cropToBuffer(imgData: Buffer, zone: ZoneBounds): Promise<Buffer> {
  return sharp(imgData)
    .extract(zone)
    .png()
    .toBuffer();
}

// ─── recognizeText ────────────────────────────────────────────────────────────

/**
 * 이미지를 zone별로 크롭 후 각각 OCR해 태그 구분자 형식으로 반환한다.
 * 실패 시 throw → pipeline이 ocr_failed로 처리한다.
 *
 * 반환 예시:
 *   §NAME§Nepel-Kasch
 *   §JOB§眞 마도학자
 *   §ROW3§명성: 103780
 */
export async function recognizeText(img: ImageBuffer): Promise<RawOCRText> {
  console.log(`[recognize] recognizeText 진입 ${img.width}×${img.height}`)
  const w = await getWorker();
  const { data, width, height } = img;

  // ── NAME zone: 이름 전용 ──
  const nameZone = computeZone(width, height, NAME_X_START, ROW1_Y_START, NAME_X_END, ROW1_Y_END);
  const nameBuf  = await cropToBuffer(data, nameZone);
  try { writeFileSync(join(process.cwd(), 'debug_zone_name.png'), nameBuf); } catch { /* ignore */ }
  const nameResult = await w.recognize(nameBuf);

  // ── JOB zone: 직업명 전용 ──
  const jobZone = computeZone(width, height, JOB_X_START, ROW1_Y_START, JOB_X_END, ROW1_Y_END);
  const jobBuf  = await cropToBuffer(data, jobZone);
  try { writeFileSync(join(process.cwd(), 'debug_zone_job.png'), jobBuf); } catch { /* ignore */ }
  const jobResult = await w.recognize(jobBuf);

  // ── ROW3 zone: 명성 ──
  const row3Zone = computeZone(width, height, 0.0, ROW3_Y_START, 1.0, ROW3_Y_END);
  const row3Buf  = await cropToBuffer(data, row3Zone);
  try { writeFileSync(join(process.cwd(), 'debug_zone_row3.png'), row3Buf); } catch { /* ignore */ }
  const row3Result = await w.recognize(row3Buf);

  return [
    `§NAME§${nameResult.data.text.trim()}`,
    `§JOB§${jobResult.data.text.trim()}`,
    `§ROW3§${row3Result.data.text.trim()}`,
  ].join('\n');
}

// ─── terminateWorker ─────────────────────────────────────────────────────────

/**
 * Tesseract Worker를 종료한다.
 * 앱 종료 시 main/index.ts의 app.on('before-quit')에서 호출할 것.
 */
export async function terminateWorker(): Promise<void> {
  if (worker) {
    await worker.terminate();
    worker = null;
  }
}
