import { describe, expect, it } from 'vitest';
import { classifyTier } from '../../services/pricing/tier-classifier.js';

describe('classifyTier', () => {
  it('classifies >40% as GRAIL', () => {
    expect(classifyTier(50)).toBe('GRAIL');
    expect(classifyTier(41)).toBe('GRAIL');
  });

  it('classifies 25-40% as HIT', () => {
    expect(classifyTier(40)).toBe('HIT');
    expect(classifyTier(30)).toBe('HIT');
  });

  it('classifies 15-25% as FLIP', () => {
    expect(classifyTier(25)).toBe('FLIP');
    expect(classifyTier(20)).toBe('FLIP');
  });

  it('classifies 5-15% as SLEEP', () => {
    expect(classifyTier(15)).toBe('SLEEP');
    expect(classifyTier(10)).toBe('SLEEP');
  });

  it('returns null for <5% (not a deal)', () => {
    expect(classifyTier(4)).toBeNull();
    expect(classifyTier(0)).toBeNull();
    expect(classifyTier(-10)).toBeNull();
  });
});
