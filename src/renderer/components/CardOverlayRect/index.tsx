import { ResizableDragFrame } from '../ResizableDragFrame';
import { CardStateRouter } from '../CardStateRouter';
import { useOverlayStore } from '../../store/overlayStore';
import { useResultStore } from '../../store/resultStore';
import type { RectBounds } from '../../../types/overlay';
import type { RectSaveRequest } from '../../../types/ipc';

export function CardOverlayRect() {
  const mode = useOverlayStore((s) => s.mode);
  const capture = useOverlayStore((s) => s.capture);
  const card = useOverlayStore((s) => s.card);
  const updateCard = useOverlayStore((s) => s.updateCard);
  const result = useResultStore((s) => s.result);
  const isRunning = useResultStore((s) => s.isRunning);
  const candidateIndex = useResultStore((s) => s.candidateIndex);
  const nextCandidate = useResultStore((s) => s.nextCandidate);
  const prevCandidate = useResultStore((s) => s.prevCandidate);
  const runLookup = useResultStore((s) => s.runLookup);

  const isActive = mode === 'edit';

  const handleDragEnd = (bounds: RectBounds) => {
    const req: RectSaveRequest = { capture, card: bounds };
    window.electronAPI.overlay.saveRects(req);
  };

  return (
    <ResizableDragFrame
      bounds={card}
      isActive={isActive}
      minWidth={180}
      minHeight={280}
      borderColor="#ffd700"
      onBoundsChange={updateCard}
      onDragEnd={handleDragEnd}
    >
      <CardStateRouter
        result={result}
        isRunning={isRunning}
        candidateIndex={candidateIndex}
        onPrev={prevCandidate}
        onNext={nextCandidate}
        onSearch={runLookup}
      />
    </ResizableDragFrame>
  );
}
