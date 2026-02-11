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

export default function LiqPill({ grade }: { grade: LiquidityGrade | null }) {
  if (!grade) return null;
  const color = LIQ_COLORS[grade] || 'var(--tMut)';
  const label = LIQ_LABELS[grade] || grade.toUpperCase();
  const dimmed = grade === 'illiquid';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '1px 6px',
        borderRadius: 4,
        border: `1px solid ${color}`,
        color,
        fontFamily: "'DM Mono', monospace",
        fontSize: 10,
        fontWeight: 500,
        lineHeight: '16px',
        opacity: dimmed ? 0.5 : 0.9,
      }}
    >
      {label}
    </span>
  );
}
