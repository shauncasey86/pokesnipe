export default function TrendArrow({ value, showValue = true }: { value: number | null | undefined; showValue?: boolean }) {
  if (value == null) return <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--tMut)' }}>—</span>;
  const pct = value * 100;
  const isUp = pct > 1;
  const isDown = pct < -1;
  const arrow = isUp ? '↑' : isDown ? '↓' : '→';
  const color = isUp ? 'var(--green)' : isDown ? 'var(--red)' : 'var(--tMut)';
  return (
    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color, whiteSpace: 'nowrap' }}>
      {arrow}{showValue && ` ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`}
    </span>
  );
}
