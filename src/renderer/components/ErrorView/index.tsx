import { useState, type CSSProperties } from 'react';

interface Props {
  message: string;
  detail?: string;
  onSearch?: (name: string) => void;
  defaultSearchValue?: string;
}

export function ErrorView({ message, detail, onSearch, defaultSearchValue = '' }: Props) {
  const [searchValue, setSearchValue] = useState(defaultSearchValue);

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

  const searchRow: CSSProperties = {
    display: 'flex',
    gap: 4,
    marginTop: 4,
    width: '100%',
  };

  const inputStyle: CSSProperties = {
    flex: 1,
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.25)',
    color: '#fff',
    borderRadius: 3,
    padding: '3px 6px',
    fontSize: 11,
    outline: 'none',
    minWidth: 0,
  };

  const btnStyle: CSSProperties = {
    background: 'rgba(255,255,255,0.15)',
    border: '1px solid rgba(255,255,255,0.25)',
    color: '#fff',
    borderRadius: 3,
    padding: '3px 8px',
    fontSize: 11,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  };

  const handleSearch = () => {
    const trimmed = searchValue.trim();
    if (trimmed) onSearch?.(trimmed);
  };

  return (
    <div style={root}>
      <div style={icon}>✕</div>
      <div style={messageStyle}>{message}</div>
      {detail && <div style={detailStyle}>{detail}</div>}
      {onSearch && (
        <div style={searchRow} onMouseDown={(e) => e.stopPropagation()}>
          <input
            style={inputStyle}
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="닉네임 검색..."
          />
          <button style={btnStyle} onClick={handleSearch}>검색</button>
        </div>
      )}
    </div>
  );
}
