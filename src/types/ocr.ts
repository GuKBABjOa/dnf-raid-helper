/**
 * ocr.ts — 화면 캡처 및 OCR 파싱 타입
 *
 * 의존: 없음 (standalone)
 * 사용처:
 *   - Main: ocr 모듈 전체 (capture, preprocess, recognize, parser)
 *   - Main: pipeline.ts (ParsedOCRResult 소비)
 *   - IPC: capture:run 요청에 CaptureRegion 포함
 *   - Renderer: ErrorView (needsManualReview 기반 경고 표시)
 *
 * 변경 영향:
 *   - CaptureRegion 변경 → capture.ts, IPC capture:run 요청 구조
 *   - ParsedOCRResult 변경 → parser.ts, pipeline.ts, PipelineResult의 모든 브랜치,
 *                            ErrorView, resultStore
 *   - jobName/renown 제거 → candidateRanker.ts 정렬 로직 붕괴
 */

/** OCR 캡처 대상 영역. RectConfig(id='capture')의 x/y/width/height에서 파생. */
export interface CaptureRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** OCR 모듈 내부에서만 사용하는 이미지 버퍼 */
export interface ImageBuffer {
  data: Buffer;
  width: number;
  height: number;
  format: 'png' | 'jpeg';
}

/** recognize 단계의 원시 출력 */
export type RawOCRText = string;

export type OCRWarningType =
  | 'LOW_CONFIDENCE'   // 전체 인식 신뢰도 낮음
  | 'NOISE_DETECTED'   // 이미지 전처리 후에도 노이즈 잔존
  | 'POSSIBLE_MISREAD'; // 특정 문자 오인식 의심

export interface OCRWarning {
  type: OCRWarningType;
  detail: string;
}

/**
 * parser.ts의 최종 출력.
 * 파티 프레임 상단 영역에서 추출 가능한 모든 값.
 *
 * - name: 필수. null이면 pipeline이 즉시 'ocr_failed' 반환.
 * - jobName: 보조. null이어도 파이프라인 계속 진행. 후보 필터링 1순위 기준.
 * - renown: 보조. null이어도 파이프라인 계속 진행. 후보 정렬 2순위 기준.
 * - needsManualReview: confidence < 0.7. UI에서 "이름 확인 권장" 경고 표시 트리거.
 */
export interface ParsedOCRResult {
  name: string | null;
  jobName: string | null;
  renown: number | null;
  confidence: number;           // 0.0 ~ 1.0
  rawLines: string[];           // 디버그/로그용 원시 줄 목록
  warnings: OCRWarning[];
  needsManualReview: boolean;
}
