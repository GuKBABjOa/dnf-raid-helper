import type { CSSProperties } from 'react';
import type { PipelineResult } from '../../../types/pipeline';
import { ResultView } from '../ResultView';
import { ErrorView } from '../ErrorView';

interface Props {
  result: PipelineResult | null;
  isRunning: boolean;
  candidateIndex: number;
  onPrev: () => void;
  onNext: () => void;
}

const centeredStyle: CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 13,
  pointerEvents: 'none',
};

export function CardStateRouter({ result, isRunning, candidateIndex, onPrev, onNext }: Props) {
  if (result === null && isRunning) {
    return (
      <div style={{ ...centeredStyle, color: 'rgba(255,255,255,0.6)' }}>
        분석 중...
      </div>
    );
  }

  if (result === null) {
    return (
      <div style={{ ...centeredStyle, color: 'rgba(255,255,255,0.3)' }}>
        캡처 대기 중 (Alt+C)
      </div>
    );
  }

  switch (result.status) {
    case 'success':
      return (
        <ResultView
          candidates={result.candidates}
          candidateIndex={candidateIndex}
          onPrev={onPrev}
          onNext={onNext}
        />
      );

    case 'ocr_failed':
      return (
        <ErrorView
          message="OCR 인식 실패"
          detail={result.ocrResult === null ? '캡처 영역을 확인하세요' : '텍스트를 인식할 수 없습니다'}
        />
      );

    case 'not_found':
      return (
        <ErrorView
          message={`'${result.name}' 없음`}
          detail="던담에서 캐릭터를 찾을 수 없습니다"
        />
      );

    case 'network_error':
      return (
        <ErrorView
          message="네트워크 오류"
          detail={result.reason}
        />
      );
  }
}
