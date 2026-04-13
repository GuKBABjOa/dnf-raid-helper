import { useRef, useEffect, useCallback, type ReactNode, type CSSProperties } from 'react';
import type { RectBounds } from '../../../types/overlay';

type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
type DragType = 'move' | ResizeHandle;

interface DragState {
  type: DragType;
  startMouseX: number;
  startMouseY: number;
  startBounds: RectBounds;
}

interface ResizableDragFrameProps {
  bounds: RectBounds;
  isActive: boolean;
  minWidth?: number;
  minHeight?: number;
  borderColor?: string;
  onBoundsChange: (bounds: RectBounds) => void;
  onDragEnd: (bounds: RectBounds) => void;
  children?: ReactNode;
}

const HANDLE_PX = 8;

const HANDLE_STYLES: Record<ResizeHandle, CSSProperties> = {
  n:  { top: -HANDLE_PX / 2, left: '50%', transform: 'translateX(-50%)', cursor: 'n-resize' },
  s:  { bottom: -HANDLE_PX / 2, left: '50%', transform: 'translateX(-50%)', cursor: 's-resize' },
  e:  { right: -HANDLE_PX / 2, top: '50%', transform: 'translateY(-50%)', cursor: 'e-resize' },
  w:  { left: -HANDLE_PX / 2, top: '50%', transform: 'translateY(-50%)', cursor: 'w-resize' },
  ne: { top: -HANDLE_PX / 2, right: -HANDLE_PX / 2, cursor: 'ne-resize' },
  nw: { top: -HANDLE_PX / 2, left: -HANDLE_PX / 2, cursor: 'nw-resize' },
  se: { bottom: -HANDLE_PX / 2, right: -HANDLE_PX / 2, cursor: 'se-resize' },
  sw: { bottom: -HANDLE_PX / 2, left: -HANDLE_PX / 2, cursor: 'sw-resize' },
};

function applyDelta(
  type: DragType,
  dx: number,
  dy: number,
  start: RectBounds,
  minW: number,
  minH: number,
): RectBounds {
  const { x, y, width, height } = start;

  const clampW = (w: number) => Math.max(minW, w);
  const clampH = (h: number) => Math.max(minH, h);

  switch (type) {
    case 'move': return { x: x + dx, y: y + dy, width, height };
    case 'e':    return { x, y, width: clampW(width + dx), height };
    case 's':    return { x, y, width, height: clampH(height + dy) };
    case 'w': { const w = clampW(width - dx); return { x: x + (width - w), y, width: w, height }; }
    case 'n': { const h = clampH(height - dy); return { x, y: y + (height - h), width, height: h }; }
    case 'se':   return { x, y, width: clampW(width + dx), height: clampH(height + dy) };
    case 'sw': { const w = clampW(width - dx); return { x: x + (width - w), y, width: w, height: clampH(height + dy) }; }
    case 'ne': { const h = clampH(height - dy); return { x, y: y + (height - h), width: clampW(width + dx), height: h }; }
    case 'nw': { const w = clampW(width - dx); const h = clampH(height - dy); return { x: x + (width - w), y: y + (height - h), width: w, height: h }; }
  }
}

export function ResizableDragFrame({
  bounds,
  isActive,
  minWidth = 100,
  minHeight = 60,
  borderColor = '#00cfff',
  onBoundsChange,
  onDragEnd,
  children,
}: ResizableDragFrameProps) {
  const dragRef = useRef<DragState | null>(null);
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;

  const startDrag = useCallback((type: DragType, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    dragRef.current = {
      type,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startBounds: { ...boundsRef.current },
    };
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const { type, startMouseX, startMouseY, startBounds } = dragRef.current;
      const newBounds = applyDelta(
        type,
        e.clientX - startMouseX,
        e.clientY - startMouseY,
        startBounds,
        minWidth,
        minHeight,
      );
      onBoundsChange(newBounds);
    };

    const onMouseUp = () => {
      if (dragRef.current) {
        onDragEnd(boundsRef.current);
        dragRef.current = null;
      }
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [minWidth, minHeight, onBoundsChange, onDragEnd]);

  const containerStyle: CSSProperties = {
    position: 'fixed',
    left: bounds.x,
    top: bounds.y,
    width: bounds.width,
    height: bounds.height,
    border: `2px solid ${isActive ? borderColor : 'rgba(0,207,255,0.3)'}`,
    borderRadius: 4,
    boxSizing: 'border-box',
    cursor: isActive ? 'move' : 'default',
    pointerEvents: isActive ? 'auto' : 'none',
  };

  const handleStyle: CSSProperties = {
    position: 'absolute',
    width: HANDLE_PX,
    height: HANDLE_PX,
    background: borderColor,
    borderRadius: 2,
  };

  return (
    <div
      style={containerStyle}
      onMouseDown={isActive ? (e) => startDrag('move', e) : undefined}
    >
      {children}

      {isActive && (Object.entries(HANDLE_STYLES) as [ResizeHandle, CSSProperties][]).map(
        ([dir, style]) => (
          <div
            key={dir}
            style={{ ...handleStyle, ...style }}
            onMouseDown={(e) => startDrag(dir, e)}
          />
        ),
      )}
    </div>
  );
}
