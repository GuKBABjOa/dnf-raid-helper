import type { CSSProperties } from 'react';
import { OverlayModeController } from './components/OverlayModeController';
import { CaptureOverlayRect } from './components/CaptureOverlayRect';
import { CardOverlayRect } from './components/CardOverlayRect';
import { useOverlayStore } from './store/overlayStore';

export function App() {
  const mode = useOverlayStore((s) => s.mode);

  const containerStyle: CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'transparent',
    pointerEvents: mode === 'edit' ? 'none' : 'none', // 컨테이너는 항상 투과
  };

  const modeIndicatorStyle: CSSProperties = {
    position: 'fixed',
    top: 8,
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '2px 10px',
    background: mode === 'edit' ? 'rgba(255,215,0,0.85)' : 'transparent',
    color: '#000',
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 'bold',
    pointerEvents: 'none',
    display: mode === 'edit' ? 'block' : 'none',
  };

  return (
    <div style={containerStyle}>
      <OverlayModeController />

      {/* edit mode 표시 배지 */}
      <div style={modeIndicatorStyle}>EDIT MODE — Alt+Z로 종료</div>

      <CaptureOverlayRect />
      <CardOverlayRect />
    </div>
  );
}
