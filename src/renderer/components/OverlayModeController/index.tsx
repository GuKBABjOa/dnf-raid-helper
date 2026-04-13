import { useEffect } from 'react';
import { useOverlayStore } from '../../store/overlayStore';

/**
 * 렌더링 없음. Main에서 오는 모드 변경 이벤트를 overlayStore에 반영한다.
 * App의 최상위에 한 번만 마운트한다.
 */
export function OverlayModeController(): null {
  const setMode = useOverlayStore((s) => s.setMode);
  const initRects = useOverlayStore((s) => s.initRects);

  // 앱 시작 시 저장된 상태 로드
  useEffect(() => {
    window.electronAPI.overlay.loadState().then((state) => {
      initRects(state.capture, state.card);
    });
  }, [initRects]);

  // Main → Renderer 모드 변경 push 구독
  useEffect(() => {
    const cleanup = window.electronAPI.overlay.onModeChange((mode) => {
      setMode(mode);
    });
    return cleanup;
  }, [setMode]);

  return null;
}
