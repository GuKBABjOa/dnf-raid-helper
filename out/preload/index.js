"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electronAPI", {
  capture: {
    /** 캡처 영역을 기준으로 파이프라인을 실행하고 PipelineResult를 반환한다. */
    run: (req) => electron.ipcRenderer.invoke("capture:run", req)
  },
  overlay: {
    /**
     * Main → Renderer 모드 변경 push 구독.
     * 반환값(cleanup)을 useEffect cleanup에서 호출해야 한다.
     */
    onModeChange: (callback) => {
      const listener = (_, payload) => {
        callback(payload.mode);
      };
      electron.ipcRenderer.on("overlay:modeChange", listener);
      return () => electron.ipcRenderer.removeListener("overlay:modeChange", listener);
    },
    /**
     * Main → Renderer 캡처 단축키(Alt+C) push 구독.
     * passive 모드에서만 Main이 전송한다.
     * 반환값(cleanup)을 useEffect cleanup에서 호출해야 한다.
     */
    onCaptureShortcut: (callback) => {
      const listener = () => callback();
      electron.ipcRenderer.on("capture:shortcut", listener);
      return () => electron.ipcRenderer.removeListener("capture:shortcut", listener);
    },
    /** Rect 위치/크기를 electron-store에 저장 */
    saveRects: (req) => electron.ipcRenderer.invoke("rect:save", req),
    /** 저장된 오버레이 상태 로드 */
    loadState: () => electron.ipcRenderer.invoke("overlay:loadState")
  }
});
