/**
 * pipeline.ts — 파이프라인 실행 컨텍스트 및 결과 타입
 *
 * 의존: ocr.ts, candidate.ts, lookup.ts
 * 사용처:
 *   - Main: pipeline/pipeline.ts (PipelineResult 생성)
 *   - Main: ipc/capture.ipc.ts (PipelineResult → IPC 응답)
 *   - Renderer: resultStore (PipelineResult 수신 후 상태 반영)
 *   - Renderer: CardStateRouter (status로 뷰 분기)
 *
 * 변경 영향:
 *   - PipelineResult 브랜치 추가/제거 → CardStateRouter, resultStore, ipc/capture.ipc.ts
 *   - success.lowConfidence 제거 → ResultView 경고 배너 로직
 *   - StageDuration.stage 변경 → pipeline/pipeline.ts 각 단계 측정 로직
 *   - PipelineTrigger.source 변경 → monitor 모듈(Phase 2), 파이프라인 로그
 */

import type { ParsedOCRResult, CaptureRegion } from './ocr';
import type { ScoredCandidate } from './candidate';
import type { LookupErrorReason } from './lookup';

/** 파이프라인 각 단계의 소요 시간. 성능 측정 및 로그용. */
export interface StageDuration {
  stage: 'capture' | 'preprocess' | 'recognize' | 'parse' | 'disambiguate' | 'scrape' | 'match' | 'score';
  durationMs: number;
}

/**
 * 파이프라인을 시작시킨 트리거.
 * source는 로그에만 기록 — 파이프라인 로직 자체는 source를 신경 쓰지 않는다.
 */
export interface PipelineTrigger {
  source: 'manual' | 'monitor';  // manual: 버튼, monitor: Phase 2 자동 감지
  region: CaptureRegion;
  triggeredAt: Date;
}

/**
 * pipeline.run()의 최종 반환 타입.
 *
 * Discriminated union: status로 타입을 좁힌다.
 *
 * | status        | 원인                              | UI 반응                        |
 * |---------------|-----------------------------------|--------------------------------|
 * | success       | 정상 완료                         | ResultView 표시                |
 * |               | (lowConfidence: true이면)         | ResultView + 경고 배너 표시    |
 * | ocr_failed    | 캡처 예외 또는 name === null       | ErrorView + 수동입력           |
 * | not_found     | 던담에 해당 캐릭터 없음             | ErrorView + 수동입력           |
 * | network_error | HTTP 실패 / 타임아웃               | ErrorView (재시도 안내)        |
 *
 * OCR 신뢰도가 낮은 경우(ocrResult.needsManualReview === true)에도
 * 검색까지 성공하면 status: 'success' + lowConfidence: true로 반환한다.
 * CardStateRouter는 status만 보고 뷰를 결정하고,
 * 경고 배너는 ResultView 내부에서 lowConfidence를 보고 표시한다.
 */
export type PipelineResult =
  | {
      status: 'success';
      candidates: ScoredCandidate[];     // 유사도 내림차순 정렬. index 0 = 가장 유사한 후보.
      ocrResult: ParsedOCRResult;
      cacheHit: boolean;
      durationMs: number;
      stageDurations: StageDuration[];
    }
  | {
      status: 'ocr_failed';
      ocrResult: ParsedOCRResult | null; // 캡처 예외면 null, 파싱 실패면 결과 포함
    }
  | {
      status: 'not_found';
      name: string;
      ocrResult: ParsedOCRResult;
    }
  | {
      status: 'network_error';
      name: string;
      reason: LookupErrorReason;
      ocrResult: ParsedOCRResult;
    };
