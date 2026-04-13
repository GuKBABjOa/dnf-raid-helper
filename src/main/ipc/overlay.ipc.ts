import { ipcMain } from 'electron';
import type Store from 'electron-store';
import type { OverlayPersistedState } from '../../types/overlay';
import type { RectSaveRequest } from '../../types/ipc';

interface StoreSchema {
  overlay: OverlayPersistedState;
}

/**
 * overlay 관련 IPC 핸들러 등록.
 * - rect:save      : Renderer가 드래그 종료 후 Rect 위치/크기 저장 요청
 * - overlay:loadState : Renderer가 초기 로드 시 저장된 상태 요청
 */
export function registerOverlayIpc(store: Store<StoreSchema>): void {
  ipcMain.handle('rect:save', (_event, req: RectSaveRequest) => {
    const current = store.get('overlay');
    store.set('overlay', { ...current, capture: req.capture, card: req.card });
  });

  ipcMain.handle('overlay:loadState', () => {
    return store.get('overlay');
  });
}
