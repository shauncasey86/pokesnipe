export default function TrendArrow({ value, showValue = true }: { value: number | null | undefined; showValue?: boolean }) {
  if (value == null) return <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: 'var(--tMut)', fontWeight: 200 }}>{'\u2014'}</span>;
  const pct = value * 100;
  const isUp = pct > 1;
  const isDown = pct < -1;
  const arrow = isUp ? '\u2191' : isDown ? '\u2193' : '\u2192';
  const color = isUp ? 'var(--green)' : isDown ? 'var(--red)' : 'var(--tMut)';
  return (
    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color, whiteSpace: 'nowrap', fontWeight: 500, fontFeatureSettings: "'tnum' 1" }}>
      {arrow}{showValue && ` ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`}
    </span>
  );
}
