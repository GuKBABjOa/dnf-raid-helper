/**
 * capture.ts — 화면 캡처 어댑터
 *
 * 의존: screenshot-desktop, types/ocr.ts
 * 사용처: main/ipc/capture.ipc.ts (PipelineDeps.capture로 주입)
 *
 * 책임 범위:
 *   - 전체 화면을 PNG 버퍼로 캡처
 *   - CaptureRegion 좌표로 해당 영역 크롭 (sharp 위임)
 *   - ImageBuffer 형식으로 반환
 *
 * 책임 밖:
 *   - 이미지 전처리 (preprocess.ts)
 *   - OCR 인식 (recognize.ts)
 *
 * 실패 정책:
 *   screenshot-desktop 또는 크롭 실패 시 throw → pipeline이 ocr_failed로 처리.
 */

import screenshot from 'screenshot-desktop';
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CaptureRegion, ImageBuffer } from '../types/ocr';

/**
 * 지정된 화면 영역을 캡처해 ImageBuffer로 반환한다.
 * 실패 시 throw → pipeline이 ocr_failed로 처리한다.
 *
 * 구현:
 *   1. screenshot-desktop으로 전체 화면을 PNG 버퍼로 캡처
 *   2. sharp로 region 좌표만큼 크롭
 *   3. raw RGBA 픽셀 데이터로 변환해 ImageBuffer로 반환
 */
export async function captureScreen(region: CaptureRegion): Promise<ImageBuffer> {
  console.log('[capture] captureScreen 진입 region=', region);
  const fullScreenBuffer: Buffer = await screenshot({ format: 'png' });

  const cropped = sharp(fullScreenBuffer).extract({
    left: Math.round(region.x),
    top: Math.round(region.y),
    width: Math.round(region.width),
    height: Math.round(region.height),
  });

  const { data, info } = await cropped
    .png()
    .toBuffer({ resolveWithObject: true });

  // [DEBUG] 캡처 결과를 파일로 저장 — 실제 영역 확인용
  try {
    const debugPath = join(process.cwd(), 'debug_capture.png');
    writeFileSync(debugPath, data);
    console.log('[capture] 디버그 이미지 저장:', debugPath);
  } catch (e) {
    console.warn('[capture] 디버그 이미지 저장 실패:', e);
  }

  return {
    data,
    width: info.width,
    height: info.height,
    format: 'png',
  };
}
