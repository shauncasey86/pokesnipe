import type { Tier } from '../../types/deals';

const TIER_CONFIG: Record<Tier, { gradient: string; letter: string; glow: string }> = {
  GRAIL: { gradient: 'linear-gradient(135deg, #ff6b35, #ff3b6f)', letter: 'G', glow: '0 0 8px rgba(255,107,53,0.6)' },
  HIT:   { gradient: 'linear-gradient(135deg, #ffd60a, #ffaa00)', letter: 'H', glow: '0 0 6px rgba(255,214,10,0.4)' },
  FLIP:  { gradient: 'linear-gradient(135deg, #6b7fa0, #4a5a78)', letter: 'F', glow: 'none' },
  SLEEP: { gradient: 'linear-gradient(135deg, #3a4060, #2a3050)', letter: 'S', glow: 'none' },
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
        fontFamily: "'DM Mono', monospace",
        fontSize: size === 'lg' ? 13 : size === 'md' ? 11 : 9,
        fontWeight: 700,
        color: '#fff',
        flexShrink: 0,
        lineHeight: 1,
      }}
    >
      {cfg.letter}
    </span>
  );
}
