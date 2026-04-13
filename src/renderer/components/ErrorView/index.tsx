import type { CSSProperties } from 'react';

interface Props {
  message: string;
  detail?: string;
}

export function ErrorView({ message, detail }: Props) {
  const root: CSSProperties = {
    padding: '10px 12px',
    color: '#e8e8e8',
    fontSize: 13,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    height: '100%',
    boxSizing: 'border-box',
    justifyContent: 'center',
    alignItems: 'center',
    textAlign: 'center',
  };

  const icon: CSSProperties = {
    fontSize: 24,
    color: '#ff5050',
  };

  const messageStyle: CSSProperties = {
    fontSize: 13,
    color: '#ff5050',
    fontWeight: 'bold',
  };

  const detailStyle: CSSProperties = {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
  };

  return (
    <div style={root}>
      <div style={icon}>✕</div>
      <div style={messageStyle}>{message}</div>
      {detail && <div style={detailStyle}>{detail}</div>}
    </div>
  );
}
