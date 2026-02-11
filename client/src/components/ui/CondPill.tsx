import type { Condition } from '../../types/deals';

const COND_COLORS: Record<Condition, string> = {
  NM: 'var(--green)',
  LP: 'var(--amber)',
  MP: '#f97316',
  HP: 'var(--red)',
  DM: '#991b1b',
};

const COND_TOOLTIPS: Record<Condition, string> = {
  NM: 'Near Mint — Excellent condition, minimal wear',
  LP: 'Lightly Played — Minor edge/surface wear',
  MP: 'Moderately Played — Noticeable wear, fully playable',
  HP: 'Heavily Played — Significant wear and creasing',
  DM: 'Damaged — Major damage, heavy creasing or tears',
};

export default function CondPill({ condition }: { condition: Condition }) {
  const color = COND_COLORS[condition] || 'var(--tMut)';
  return (
    <span
      title={COND_TOOLTIPS[condition] ?? condition}
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
        opacity: 0.9,
        cursor: 'help',
      }}
    >
      {condition}
    </span>
  );
}
