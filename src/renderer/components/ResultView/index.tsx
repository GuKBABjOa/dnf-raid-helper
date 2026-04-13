import type { CSSProperties } from 'react';
import type { ScoredCandidate } from '../../../types/candidate';

interface Props {
  candidates: ScoredCandidate[];
  candidateIndex: number;
  onPrev: () => void;
  onNext: () => void;
}

export function ResultView({ candidates, candidateIndex, onPrev, onNext }: Props) {
  const data = candidates[candidateIndex];
  const total = candidates.length;

  const root: CSSProperties = {
    padding: '10px 12px',
    color: '#e8e8e8',
    fontSize: 13,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    height: '100%',
    boxSizing: 'border-box',
  };

  const nameRow: CSSProperties = {
    display: 'flex',
    alignItems: 'baseline',
    gap: 6,
  };

  const nameText: CSSProperties = {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
  };

  const serverText: CSSProperties = {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
  };

  const divider: CSSProperties = {
    borderTop: '1px solid rgba(255,255,255,0.15)',
    margin: '2px 0',
  };

  const statLabel: CSSProperties = {
    fontSize: 11,
    color: 'rgba(255,255,255,0.45)',
  };

  const statValue: CSSProperties = {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffd700',
  };

  const navRow: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 'auto',
    paddingTop: 4,
  };

  const navBtn: CSSProperties = {
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.2)',
    color: '#fff',
    borderRadius: 3,
    padding: '2px 8px',
    fontSize: 13,
    cursor: 'pointer',
  };

  const navBtnDisabled: CSSProperties = {
    ...navBtn,
    opacity: 0.25,
    cursor: 'default',
  };

  const navCounter: CSSProperties = {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
  };

  return (
    <div style={root}>
      {/* 이름 + 서버 */}
      <div style={nameRow}>
        <span style={nameText}>{data.name}</span>
        <span style={serverText}>[{data.server}]</span>
      </div>

      {/* 직업 */}
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>{data.jobName}</div>

      {/* 명성 */}
      <div>
        <span style={statLabel}>명성 </span>
        <span>{data.renown.toLocaleString()}</span>
      </div>

      <div style={divider} />

      {/* 딜/버프 수치 */}
      <div>
        <div style={statLabel}>{data.stats.type === 'damage' ? '딜 수치' : '버프 점수'}</div>
        <div style={statValue}>{data.stats.displayLabel}</div>
      </div>

      {/* ← → 네비게이터 — 후보 2명 이상일 때만 */}
      {total >= 2 && (
        <div style={navRow}>
          <button
            style={candidateIndex === 0 ? navBtnDisabled : navBtn}
            disabled={candidateIndex === 0}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={onPrev}
          >
            ◀
          </button>
          <span style={navCounter}>{candidateIndex + 1} / {total}</span>
          <button
            style={candidateIndex === total - 1 ? navBtnDisabled : navBtn}
            disabled={candidateIndex === total - 1}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={onNext}
          >
            ▶
          </button>
        </div>
      )}
    </div>
  );
}
