/**
 * ipc.ts — Renderer ↔ Main Process 통신 타입
 *
 * 의존: pipeline.ts, overlay.ts, ocr.ts
 * 사용처:
 *   - Main: ipc/capture.ipc.ts, ipc/overlay.ipc.ts
 *   - Renderer: IPC 호출부 (preload를 통해 노출된 API)
 *
 * 원칙 (ADR-006):
 *   - Renderer는 채널 이름과 이 파일의 타입만 안다.
 *   - Main 내부 구현(pipeline, scraper 등)은 Renderer가 알지 못한다.
 *   - contextBridge를 통해 preload에서 타입 안전하게 노출한다.
 *
 * 변경 영향:
 *   - IpcChannel 변경 → preload.ts, 모든 ipc/*.ipc.ts, Renderer IPC 호출부
 *   - CaptureRunResponse(=PipelineResult) 변경 → resultStore, CardStateRouter
 *   - RectSaveRequest 변경 → ipc/overlay.ipc.ts, ResizableDragFrame의 저장 호출부
 */

import type { PipelineResult } from './pipeline';
import type { OverlayMode, RectBounds } from './overlay';
import type { CaptureRegion } from './ocr';

/** 앱에서 사용하는 모든 IPC 채널 이름 */
export type IpcChannel =
  | 'capture:run'          // Renderer → Main: 캡처 파이프라인 실행
  | 'capture:shortcut'     // Main → Renderer: Alt+C 캡처 단축키 push (passive 모드에서만)
  | 'lookup:byName'        // Renderer → Main: 닉네임 직접 검색
  | 'overlay:modeChange'   // Main → Renderer: 모드 변경 push (글로벌 단축키 감지)
  | 'rect:save'            // Renderer → Main: Rect 위치/크기 영속화
  | 'settings:getInviteCode'  // Renderer → Main: 저장된 초대코드 조회
  | 'settings:setInviteCode'; // Renderer → Main: 초대코드 저장

// ─── capture:run ───────────────────────────────────────────────────────────

export interface CaptureRunRequest {
  region: CaptureRegion;
}

/** capture:run 응답 = PipelineResult 그대로 */
export type CaptureRunResponse = PipelineResult;

// ─── lookup:byName ─────────────────────────────────────────────────────────

export interface LookupByNameRequest {
  name: string;
}

/** lookup:byName 응답 = PipelineResult 그대로 */
export type LookupByNameResponse = PipelineResult;

// ─── overlay:modeChange ────────────────────────────────────────────────────

/** Main → Renderer push. 글로벌 단축키 감지 시 Main이 먼저 모드를 결정하고 알린다. */
export interface ModeChangePayload {
  mode: OverlayMode;
}

// ─── rect:save ─────────────────────────────────────────────────────────────

/**
 * Renderer → Main: 두 Rect의 현재 위치/크기를 electron-store에 저장 요청.
 * 배열 대신 명시적 키로 구분 — 순서 의존 없이 컴파일 타임에 양쪽 존재 보장.
 */
export interface RectSaveRequest {
  capture: RectBounds;
  card: RectBounds;
}
