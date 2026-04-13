import { create } from 'zustand';
import type { OverlayMode, RectBounds } from '../../types/overlay';

interface OverlayStore {
  mode: OverlayMode;
  capture: RectBounds;
  card: RectBounds;
  setMode: (mode: OverlayMode) => void;
  updateCapture: (bounds: RectBounds) => void;
  updateCard: (bounds: RectBounds) => void;
  initRects: (capture: RectBounds, card: RectBounds) => void;
}

export const useOverlayStore = create<OverlayStore>((set) => ({
  mode: 'passive',
  capture: { x: 100, y: 200, width: 420, height: 120 },
  card: { x: 900, y: 100, width: 220, height: 450 },
  setMode: (mode) => set({ mode }),
  updateCapture: (bounds) => set({ capture: bounds }),
  updateCard: (bounds) => set({ card: bounds }),
  initRects: (capture, card) => set({ capture, card }),
}));
