import type { OverlayMode, OverlayPersistedState } from '../types/overlay';
import type { RectSaveRequest, CaptureRunRequest, CaptureRunResponse, LookupByNameRequest, LookupByNameResponse } from '../types/ipc';

/**
 * contextBridge로 노출된 API 타입 선언.
 * preload/index.ts의 exposeInMainWorld와 반드시 일치해야 한다.
 */
declare global {
  interface Window {
    electronAPI: {
      capture: {
        run: (req: CaptureRunRequest) => Promise<CaptureRunResponse>;
        lookupByName: (req: LookupByNameRequest) => Promise<LookupByNameResponse>;
      };
      overlay: {
        onModeChange: (callback: (mode: OverlayMode) => void) => () => void;
        onCaptureShortcut: (callback: () => void) => () => void;
        saveRects: (req: RectSaveRequest) => Promise<void>;
        loadState: () => Promise<OverlayPersistedState>;
      };
      settings: {
        getInviteCode: () => Promise<string | null>;
        setInviteCode: (code: string) => Promise<void>;
      };
    };
  }
}
