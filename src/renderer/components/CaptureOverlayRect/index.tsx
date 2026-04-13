import { useEffect } from 'react';
import type { CSSProperties } from 'react';
import { ResizableDragFrame } from '../ResizableDragFrame';
import { useOverlayStore } from '../../store/overlayStore';
import { useResultStore } from '../../store/resultStore';
import type { RectBounds } from '../../../types/overlay';
import type { RectSaveRequest } from '../../../types/ipc';

export function CaptureOverlayRect() {
  const mode = useOverlayStore((s) => s.mode);
  const capture = useOverlayStore((s) => s.capture);
  const card = useOverlayStore((s) => s.card);
  const updateCapture = useOverlayStore((s) => s.updateCapture);
  const isRunning = useResultStore((s) => s.isRunning);
  const runCapture = useResultStore((s) => s.runCapture);

  const isActive = mode === 'edit';

  // Alt+C 단축키: Main이 passive 모드에서만 push, 여기서 수신해 캡처 실행
  useEffect(() => {
    const cleanup = window.electronAPI.overlay.onCaptureShortcut(() => {
      if (!isRunning) runCapture(capture);
    });
    return cleanup;
  }, [capture, isRunning, runCapture]);

  const handleDragEnd = (bounds: RectBounds) => {
    const req: RectSaveRequest = { capture: bounds, card };
    window.electronAPI.overlay.saveRects(req);
  };

  const labelStyle: CSSProperties = {
    position: 'absolute',
    top: 2,
    left: 4,
    fontSize: 11,
    color: 'rgba(0,207,255,0.8)',
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
  };

  return (
    <ResizableDragFrame
      bounds={capture}
      isActive={isActive}
      minWidth={150}
      minHeight={60}
      borderColor="#00cfff"
      onBoundsChange={updateCapture}
      onDragEnd={handleDragEnd}
    >
      {isActive && <span style={labelStyle}>캡처 영역 (Alt+C로 캡처)</span>}
    </ResizableDragFrame>
  );
}
