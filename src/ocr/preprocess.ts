/**
 * preprocess.ts — 이미지 전처리 어댑터
 *
 * 의존: sharp, types/ocr.ts
 * 사용처: main/ipc/capture.ipc.ts (PipelineDeps.preprocess로 주입)
 *
 * 책임 범위:
 *   - 그레이스케일 변환 (채널 수 감소 → OCR 속도 향상)
 *   - 업스케일 (3×) — 작은 글자의 인식률 향상
 *   - 대비 정규화 — 어두운 게임 UI에서 흰 텍스트를 선명하게
 *
 * pipeline 정책:
 *   이 함수가 throw해도 pipeline은 중단하지 않는다 (SILENT 실패).
 *   pipeline.ts가 예외를 잡아 원본 ImageBuffer를 그대로 사용한다.
 *
 * 전처리 전략 근거 (DNF 신청창 특성):
 *   - 배경: 어두운 네이비/검정
 *   - 텍스트: 흰색(이름) / 노란색(레벨, 명성값) / 하늘색(명성 라벨)
 *   - 업스케일 2×: Tesseract는 300dpi 이상에서 정확도가 높음.
 *     캡처 이미지가 ~100px 높이이므로 업스케일이 효과적.
 *   - 대비 강화: 게임 UI의 반투명 배경 노이즈 억제.
 */

import sharp from 'sharp';
import type { ImageBuffer } from '../types/ocr';

/**
 * OCR 인식률을 높이기 위한 이미지 전처리 (일반 zone용).
 * 실패 시 throw해도 pipeline이 원본을 사용하므로 안전하다.
 *
 * 처리 순서:
 *   1. 그레이스케일 변환
 *   2. 3× 업스케일 (lanczos3 - 텍스트 엣지 보존)
 *   3. 대비 정규화 (normalize: 최솟값→0, 최댓값→255)
 *   4. sharpen — 게임 폰트의 획 경계 선명화
 *   5. PNG 버퍼로 출력
 */
export async function preprocessImage(img: ImageBuffer): Promise<ImageBuffer> {
  console.log(`[preprocess] preprocessImage 진입 ${img.width}×${img.height}`);
  const { data, info } = await sharp(img.data)
    .grayscale()
    .resize(img.width * 3, img.height * 3, {
      kernel: sharp.kernel.lanczos3,
    })
    .normalize()
    .sharpen()
    .png()
    .toBuffer({ resolveWithObject: true });

  return {
    data,
    width: info.width,
    height: info.height,
    format: 'png',
  };
}

/**
 * 이름 zone 전용 강화 전처리.
 * 일반 preprocessImage보다 공격적인 업스케일 + 이진화로
 * 특수문자(♥, †, ★ 등)를 포함한 이름 인식률을 높인다.
 *
 * 처리 순서:
 *   1. 그레이스케일 변환
 *   2. 3× 업스케일 (lanczos3)
 *   3. 대비 정규화
 *   4. 임계값 이진화 (threshold=160): 배경 노이즈 제거, 텍스트 선명화
 *      DNF 이름 텍스트는 흰색(밝음) → 160 이상을 흰색으로 유지
 *   5. PNG 버퍼로 출력
 */
export async function preprocessNameZone(img: ImageBuffer): Promise<ImageBuffer> {
  const { data, info } = await sharp(img.data)
    .grayscale()
    .resize(img.width * 3, img.height * 3, {
      kernel: sharp.kernel.lanczos3,
    })
    .normalize()
    .negate()   // DNF: 흰 텍스트+어두운 배경 → 반전 → 어두운 텍스트+흰 배경 (Tesseract 최적)
    .png()
    .toBuffer({ resolveWithObject: true });

  return {
    data,
    width: info.width,
    height: info.height,
    format: 'png',
  };
}
