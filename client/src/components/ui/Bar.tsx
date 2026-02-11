function barColor(value: number): string {
  if (value >= 0.85) return 'var(--green)';
  if (value >= 0.65) return 'var(--amber)';
  return 'var(--red)';
}

export default function Bar({ value, height = 4 }: { value: number; height?: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const color = barColor(value);
  return (
    <div
      style={{
        flex: 1,
        height,
        borderRadius: height,
        background: 'rgba(255,255,255,0.06)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: '100%',
          borderRadius: height,
          background: color,
          transition: 'width 0.4s ease',
        }}
      />
    </div>
  );
}

export function BarRow({ label, value }: { label: string; value: number | null | undefined }) {
  const v = value ?? 0;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '66px 1fr 38px', alignItems: 'center', gap: 8, padding: '3px 0' }}>
      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--tSec)', textTransform: 'capitalize' }}>{label}</span>
      <Bar value={v} height={5} />
      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: v >= 0.85 ? 'var(--green)' : v >= 0.65 ? 'var(--amber)' : 'var(--red)', textAlign: 'right' }}>
        {(v * 100).toFixed(0)}%
      </span>
    </div>
  );
}
