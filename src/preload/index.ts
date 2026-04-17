import { contextBridge, ipcRenderer } from 'electron';
import type { OverlayMode, OverlayPersistedState } from '../types/overlay';
import type { RectSaveRequest, ModeChangePayload, CaptureRunRequest, CaptureRunResponse, LookupByNameRequest, LookupByNameResponse } from '../types/ipc';

/**
 * Renderer에서 window.electronAPI로 접근 가능한 API.
 * contextBridge를 통해 안전하게 노출 (ADR-006).
 */
contextBridge.exposeInMainWorld('electronAPI', {
  capture: {
    /** 캡처 영역을 기준으로 파이프라인을 실행하고 PipelineResult를 반환한다. */
    run: (req: CaptureRunRequest): Promise<CaptureRunResponse> =>
      ipcRenderer.invoke('capture:run', req),
    /** 닉네임으로 직접 던담 검색. */
    lookupByName: (req: LookupByNameRequest): Promise<LookupByNameResponse> =>
      ipcRenderer.invoke('lookup:byName', req),
  },
  overlay: {
    /**
     * Main → Renderer 모드 변경 push 구독.
     * 반환값(cleanup)을 useEffect cleanup에서 호출해야 한다.
     */
    onModeChange: (callback: (mode: OverlayMode) => void): (() => void) => {
      const listener = (_: Electron.IpcRendererEvent, payload: ModeChangePayload) => {
        callback(payload.mode);
      };
      ipcRenderer.on('overlay:modeChange', listener);
      return () => ipcRenderer.removeListener('overlay:modeChange', listener);
    },

    /**
     * Main → Renderer 캡처 단축키(Alt+C) push 구독.
     * passive 모드에서만 Main이 전송한다.
     * 반환값(cleanup)을 useEffect cleanup에서 호출해야 한다.
     */
    onCaptureShortcut: (callback: () => void): (() => void) => {
      const listener = () => callback();
      ipcRenderer.on('capture:shortcut', listener);
      return () => ipcRenderer.removeListener('capture:shortcut', listener);
    },

    /** Rect 위치/크기를 electron-store에 저장 */
    saveRects: (req: RectSaveRequest): Promise<void> =>
      ipcRenderer.invoke('rect:save', req),

    /** 저장된 오버레이 상태 로드 */
    loadState: (): Promise<OverlayPersistedState> =>
      ipcRenderer.invoke('overlay:loadState'),
  },

  settings: {
    /** 저장된 초대코드 조회 (없으면 null) */
    getInviteCode: (): Promise<string | null> =>
      ipcRenderer.invoke('settings:getInviteCode'),

    /** 초대코드 저장 및 OCR 프로바이더 갱신 */
    setInviteCode: (code: string): Promise<void> =>
      ipcRenderer.invoke('settings:setInviteCode', code),
  },
});
