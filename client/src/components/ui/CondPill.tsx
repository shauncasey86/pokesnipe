import type { Condition } from '../../types/deals';

const COND_COLORS: Record<Condition, string> = {
  NM: 'var(--green)',
  LP: 'var(--amber)',
  MP: '#f97316',
  HP: 'var(--red)',
  DM: '#991b1b',
};

export default function CondPill({ condition }: { condition: Condition }) {
  const color = COND_COLORS[condition] || 'var(--tMut)';
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
        opacity: 0.9,
      }}
    >
      {condition}
    </span>
  );
}
