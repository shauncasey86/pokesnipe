import type { Tier } from '../../types/deals';

const TIER_CONFIG: Record<Tier, { gradient: string; letter: string; glow: string }> = {
  GRAIL: { gradient: 'var(--grad-grail)', letter: 'G', glow: '0 0 8px rgba(255,107,53,0.6)' },
  HIT:   { gradient: 'var(--grad-hit)', letter: 'H', glow: '0 0 6px rgba(56,189,248,0.4)' },
  FLIP:  { gradient: 'var(--grad-flip)', letter: 'F', glow: 'none' },
  SLEEP: { gradient: 'var(--grad-sleep)', letter: 'S', glow: 'none' },
};

export default function TierBadge({ tier, size = 'sm' }: { tier: Tier; size?: 'sm' | 'md' | 'lg' }) {
  const cfg = TIER_CONFIG[tier] || TIER_CONFIG.FLIP;
  const px = size === 'lg' ? 28 : size === 'md' ? 22 : 16;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: px,
        height: px,
        borderRadius: px,
        background: cfg.gradient,
        boxShadow: cfg.glow,
        fontFamily: "var(--font-mono)",
        fontSize: size === 'lg' ? 13 : size === 'md' ? 11 : 9,
        fontWeight: 800,
        color: '#fff',
        flexShrink: 0,
        lineHeight: 1,
      }}
    >
      {cfg.letter}
    </span>
  );
}
