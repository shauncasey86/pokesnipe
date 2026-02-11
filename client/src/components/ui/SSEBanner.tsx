import { useEffect, useState } from 'react';

export default function SSEBanner({
  state,
  onRetry,
}: {
  state: 'connected' | 'reconnecting' | 'lost' | 'restored';
  onRetry: () => void;
}) {
  const [showRestored, setShowRestored] = useState(false);

  useEffect(() => {
    if (state === 'restored') {
      setShowRestored(true);
      const timer = setTimeout(() => setShowRestored(false), 3000);
      return () => clearTimeout(timer);
    }
    setShowRestored(false);
  }, [state]);

  if (state === 'connected' && !showRestored) return null;

  if (showRestored || state === 'restored') {
    return (
      <div
        style={{
          width: '100%',
          padding: '6px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          fontSize: 12,
          fontWeight: 500,
          color: 'var(--green)',
          background: 'rgba(52,211,153,0.08)',
          borderBottom: '1px solid rgba(52,211,153,0.15)',
          transition: 'opacity 0.5s',
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 6,
            background: 'var(--green)',
          }}
        />
        Connection restored
      </div>
    );
  }

  if (state === 'connected') return null;

  const isLost = state === 'lost';

  return (
    <div
      style={{
        width: '100%',
        padding: '6px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        fontSize: 12,
        fontWeight: 500,
        color: isLost ? 'var(--red)' : 'var(--amber)',
        background: isLost ? 'rgba(248,113,113,0.08)' : 'rgba(251,191,36,0.08)',
        borderBottom: `1px solid ${isLost ? 'rgba(248,113,113,0.15)' : 'rgba(251,191,36,0.15)'}`,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 6,
          background: isLost ? 'var(--red)' : 'var(--amber)',
          animation: isLost ? undefined : 'pulse 1.5s infinite',
        }}
      />
      {isLost ? 'Connection lost' : 'Reconnecting...'}
      {isLost && (
        <button
          onClick={onRetry}
          style={{
            background: 'none',
            border: '1px solid var(--red)',
            color: 'var(--red)',
            borderRadius: 4,
            padding: '2px 8px',
            fontSize: 11,
            fontWeight: 600,
            marginLeft: 4,
          }}
        >
          Retry
        </button>
      )}
    </div>
  );
}
