export default function SystemBanner({ message, level }: { message: string; level: 'warning' | 'error' }) {
  if (!message) return null;
  const isError = level === 'error';
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
        color: isError ? 'var(--red)' : 'var(--amber)',
        background: isError ? 'rgba(248,113,113,0.06)' : 'rgba(251,191,36,0.06)',
        borderBottom: `1px solid ${isError ? 'rgba(248,113,113,0.1)' : 'rgba(251,191,36,0.1)'}`,
      }}
    >
      {message}
    </div>
  );
}
