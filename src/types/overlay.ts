/**
 * overlay.ts — 오버레이 UI 상태 타입
 *
 * 의존: 없음 (standalone)
 * 사용처:
 *   - Renderer: OverlayModeController, ResizableDragFrame
 *   - Main: index.ts (setIgnoreMouseEvents 호출 기준)
 *   - IPC: overlay:modeChange, rect:save 채널
 *
 * 변경 영향:
 *   - OverlayMode 변경 → OverlayModeController, IPC 채널, Main index.ts
 *   - RectBounds 변경 → RectConfig, RectSaveRequest(ipc.ts), ResizableDragFrame
 *   - RectConfig 변경 → ResizableDragFrame, electron-store 저장 구조
 */

/** 오버레이의 현재 인터랙션 모드 */
export type OverlayMode = 'passive' | 'edit';
//   passive: setIgnoreMouseEvents(true)  — 게임 클릭 투과
//   edit:    setIgnoreMouseEvents(false) — 오버레이 직접 조작 가능

/**
 * Rect의 위치·크기 좌표만 담는 순수 구조.
 * RectConfig와 RectSaveRequest 양쪽에서 재사용한다.
 */
export interface RectBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 두 Rect(CaptureRect, CardRect)의 식별자 포함 전체 구조 */
export interface RectConfig extends RectBounds {
  id: 'capture' | 'card';
}

/** electron-store에 저장되는 영속 설정 */
export interface OverlayPersistedState {
  capture: RectBounds;   // CaptureRect 위치·크기
  card: RectBounds;      // CardRect 위치·크기
  shortcutKey: string;   // 기본값: 'Alt+Z'
}
