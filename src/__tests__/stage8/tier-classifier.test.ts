import { describe, it, expect } from 'vitest';
import { classifyTier } from '../../services/scanner/tier-classifier.js';

describe('tier-classifier', () => {
  it('classifies GRAIL (>40% profit + ≥0.85 confidence)', () => {
    expect(classifyTier(45, 0.90, 'high')).toBe('GRAIL');
  });

  it('downgrades high-profit low-confidence to HIT', () => {
    expect(classifyTier(45, 0.70, 'high')).toBe('HIT'); // >40% but <0.85 confidence
  });

  it('classifies HIT (>25% profit + ≥0.65 confidence)', () => {
    expect(classifyTier(30, 0.70, 'high')).toBe('HIT');
  });

  it('downgrades medium-profit low-confidence to FLIP', () => {
    expect(classifyTier(30, 0.50, 'high')).toBe('FLIP'); // >25% but <0.65 confidence
  });

  it('classifies FLIP (>15% profit)', () => {
    expect(classifyTier(20, 0.60, 'high')).toBe('FLIP');
  });

  it('classifies SLEEP (5-15% profit)', () => {
    expect(classifyTier(10, 0.50, 'high')).toBe('SLEEP');
  });

  it('classifies very low profit as SLEEP', () => {
    expect(classifyTier(6, 0.90, 'high')).toBe('SLEEP');
  });

  it('handles boundary: exactly 40% + high confidence', () => {
    expect(classifyTier(40, 0.85, 'high')).toBe('HIT'); // NOT GRAIL (must be >40%, not ≥40%)
  });

  it('handles boundary: exactly 25% + medium confidence', () => {
    expect(classifyTier(25, 0.65, 'high')).toBe('FLIP'); // NOT HIT (must be >25%)
  });

  it('handles boundary: exactly 15%', () => {
    expect(classifyTier(15, 0.50, 'high')).toBe('SLEEP'); // NOT FLIP (must be >15%)
  });
});
