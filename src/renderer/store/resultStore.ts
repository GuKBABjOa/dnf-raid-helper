import { create } from 'zustand';
import type { PipelineResult } from '../../types/pipeline';
import type { RectBounds } from '../../types/overlay';
import { MOCK_RESULTS } from '../dev/mockResults';

/**
 * 실행 모드 전환.
 * true  → MOCK_RESULTS 순환 (OCR 없이 UI 확인)
 * false → window.electronAPI.capture.run 실제 IPC 호출
 */
export const USE_MOCK = false;

interface ResultStore {
  result: PipelineResult | null;
  isRunning: boolean;
  mockIdx: number;
  candidateIndex: number;        // 현재 표시 중인 후보 인덱스 (success 상태에서만 의미 있음)
  clearResult: () => void;
  runCapture: (region: RectBounds) => Promise<void>;
  nextCandidate: () => void;
  prevCandidate: () => void;
}

export const useResultStore = create<ResultStore>((set, get) => ({
  result: null,
  isRunning: false,
  mockIdx: 0,
  candidateIndex: 0,

  clearResult: () => set({ result: null, candidateIndex: 0 }),

  runCapture: async (region: RectBounds) => {
    if (USE_MOCK) {
      const { mockIdx } = get();
      set({
        result: MOCK_RESULTS[mockIdx],
        mockIdx: (mockIdx + 1) % MOCK_RESULTS.length,
        candidateIndex: 0,
      });
      return;
    }

    set({ result: null, isRunning: true, candidateIndex: 0 });
    try {
      const result = await window.electronAPI.capture.run({ region });
      set({ result, candidateIndex: 0 });
    } catch {
      set({ result: { status: 'ocr_failed', ocrResult: null } });
    } finally {
      set({ isRunning: false });
    }
  },

  nextCandidate: () => {
    const { result, candidateIndex } = get();
    if (result?.status !== 'success') return;
    const max = result.candidates.length - 1;
    set({ candidateIndex: Math.min(candidateIndex + 1, max) });
  },

  prevCandidate: () => {
    const { candidateIndex } = get();
    set({ candidateIndex: Math.max(candidateIndex - 1, 0) });
  },
}));
