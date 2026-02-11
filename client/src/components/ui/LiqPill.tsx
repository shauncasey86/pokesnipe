import type { LiquidityGrade } from '../../types/deals';

const LIQ_COLORS: Record<string, string> = {
  HIGH: 'var(--green)',
  MED: 'var(--amber)',
  LOW: '#f97316',
  ILLIQ: 'var(--red)',
};

export default function LiqPill({ grade }: { grade: LiquidityGrade | null }) {
  if (!grade) return null;
  const color = LIQ_COLORS[grade] || 'var(--tMut)';
  const dimmed = grade === 'ILLIQ';
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
      {grade}
    </span>
  );
}
