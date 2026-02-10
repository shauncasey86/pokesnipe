import { describe, it, expect } from 'vitest';
import { adjustTierForLiquidity } from '../../services/liquidity/tier-adjuster.js';

describe('tier-adjuster', () => {
  it('does not adjust with high liquidity', () => {
    expect(adjustTierForLiquidity('GRAIL', 'high')).toBe('GRAIL');
    expect(adjustTierForLiquidity('HIT', 'high')).toBe('HIT');
    expect(adjustTierForLiquidity('FLIP', 'high')).toBe('FLIP');
    expect(adjustTierForLiquidity('SLEEP', 'high')).toBe('SLEEP');
  });

  it('downgrades GRAIL to HIT with medium liquidity', () => {
    expect(adjustTierForLiquidity('GRAIL', 'medium')).toBe('HIT');
  });

  it('does not downgrade HIT/FLIP/SLEEP with medium liquidity', () => {
    expect(adjustTierForLiquidity('HIT', 'medium')).toBe('HIT');
    expect(adjustTierForLiquidity('FLIP', 'medium')).toBe('FLIP');
    expect(adjustTierForLiquidity('SLEEP', 'medium')).toBe('SLEEP');
  });

  it('caps GRAIL and HIT to FLIP with low liquidity', () => {
    expect(adjustTierForLiquidity('GRAIL', 'low')).toBe('FLIP');
    expect(adjustTierForLiquidity('HIT', 'low')).toBe('FLIP');
  });

  it('does not downgrade FLIP/SLEEP with low liquidity', () => {
    expect(adjustTierForLiquidity('FLIP', 'low')).toBe('FLIP');
    expect(adjustTierForLiquidity('SLEEP', 'low')).toBe('SLEEP');
  });

  it('caps everything to SLEEP with illiquid', () => {
    expect(adjustTierForLiquidity('GRAIL', 'illiquid')).toBe('SLEEP');
    expect(adjustTierForLiquidity('HIT', 'illiquid')).toBe('SLEEP');
    expect(adjustTierForLiquidity('FLIP', 'illiquid')).toBe('SLEEP');
    expect(adjustTierForLiquidity('SLEEP', 'illiquid')).toBe('SLEEP');
  });
});
