import type { LiquidityGrade } from '../../types/deals';

const LIQ_COLORS: Record<string, string> = {
  high: 'var(--green)',
  medium: 'var(--amber)',
  low: '#f97316',
  illiquid: 'var(--red)',
};

const LIQ_LABELS: Record<string, string> = {
  high: 'HIGH',
  medium: 'MED',
  low: 'LOW',
  illiquid: 'ILLIQ',
};

const LIQ_TOOLTIPS: Record<string, string> = {
  high: 'High liquidity — Sells quickly, strong demand',
  medium: 'Medium liquidity — Sells reasonably, moderate demand',
  low: 'Low liquidity — May take time to sell',
  illiquid: 'Illiquid — Very slow to sell, weak demand',
};

export default function LiqPill({ grade }: { grade: LiquidityGrade | null }) {
  if (!grade) return null;
  const color = LIQ_COLORS[grade] || 'var(--tMut)';
  const label = LIQ_LABELS[grade] || grade.toUpperCase();
  const dimmed = grade === 'illiquid';
  return (
    <span
      title={LIQ_TOOLTIPS[grade] ?? grade}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '1px 6px',
        borderRadius: 4,
        border: `1px solid ${color}`,
        color,
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        fontWeight: 500,
        lineHeight: '16px',
        opacity: dimmed ? 0.5 : 0.9,
        cursor: 'help',
      }}
    >
      {label}
    </span>
  );
}
