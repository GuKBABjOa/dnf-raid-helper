import { useState, type CSSProperties, type KeyboardEvent } from 'react';

interface Props {
  onComplete: (code: string) => void;
}

export function SetupModal({ onComplete }: Props) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const trimmed = code.trim();
    if (!trimmed) {
      setError('초대코드를 입력해주세요.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await window.electronAPI.settings.setInviteCode(trimmed);
      onComplete(trimmed);
    } catch {
      setError('저장 중 오류가 발생했습니다.');
      setSaving(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleSave();
  }

  const overlay: CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.75)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  };

  const card: CSSProperties = {
    background: '#1a1a2e',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 12,
    padding: '32px 28px',
    width: 360,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
  };

  const title: CSSProperties = {
    color: '#fff',
    fontSize: 18,
    fontWeight: 700,
    margin: 0,
    textAlign: 'center',
  };

  const desc: CSSProperties = {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    margin: 0,
    textAlign: 'center',
    lineHeight: 1.6,
  };

  const input: CSSProperties = {
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 6,
    color: '#fff',
    fontSize: 14,
    padding: '10px 12px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  };

  const btn: CSSProperties = {
    background: saving ? 'rgba(255,215,0,0.4)' : 'rgba(255,215,0,0.85)',
    border: 'none',
    borderRadius: 6,
    color: '#000',
    cursor: saving ? 'default' : 'pointer',
    fontSize: 14,
    fontWeight: 700,
    padding: '10px 0',
    width: '100%',
  };

  const errStyle: CSSProperties = {
    color: '#ff6b6b',
    fontSize: 12,
    margin: 0,
    textAlign: 'center',
  };

  return (
    <div style={overlay}>
      <div style={card}>
        <p style={title}>DNF 공대장 도우미</p>
        <p style={desc}>
          사용하려면 초대코드가 필요합니다.<br />
          코드를 입력하고 시작하세요.
        </p>
        <input
          style={input}
          type="text"
          placeholder="초대코드 입력"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          disabled={saving}
        />
        {error && <p style={errStyle}>{error}</p>}
        <button style={btn} onClick={handleSave} disabled={saving}>
          {saving ? '저장 중...' : '시작하기'}
        </button>
      </div>
    </div>
  );
}
