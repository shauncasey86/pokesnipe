import { describe, it, expect } from 'vitest';
import { computeConfidence } from '../../services/matching/confidence-scorer.js';

describe('computeConfidence', () => {
  it('returns high confidence for all-perfect signals', () => {
    const result = computeConfidence({
      name: 1.0,
      number: 1.0,
      denominator: 1.0,
      expansion: 1.0,
      variant: 1.0,
      normalization: 1.0,
    });
    expect(result.composite).toBe(1.0);
  });

  it('returns lower score when one signal is poor', () => {
    const good = computeConfidence({
      name: 1.0, number: 1.0, denominator: 1.0,
      expansion: 1.0, variant: 1.0, normalization: 1.0,
    });
    const withPoorName = computeConfidence({
      name: 0.50, number: 1.0, denominator: 1.0,
      expansion: 1.0, variant: 1.0, normalization: 1.0,
    });
    expect(withPoorName.composite).toBeLessThan(good.composite);
  });

  it('geometric mean punishes low signals more than arithmetic', () => {
    const result = computeConfidence({
      name: 0.30, number: 1.0, denominator: 1.0,
      expansion: 1.0, variant: 1.0, normalization: 1.0,
    });
    // Geometric mean should be lower than arithmetic average
    const arithmeticAvg = (0.30 * 0.30 + 1.0 * 0.25 + 1.0 * 0.15 + 1.0 * 0.10 + 1.0 * 0.10 + 1.0 * 0.10);
    expect(result.composite).toBeLessThan(arithmeticAvg);
  });

  it('preserves signal values in result', () => {
    const signals = {
      name: 0.85, number: 1.0, denominator: 0.50,
      expansion: 0.70, variant: 0.95, normalization: 0.75,
    };
    const result = computeConfidence(signals);
    expect(result.signals).toEqual(signals);
  });

  it('clamps very low scores to 0.01 (avoids log(0))', () => {
    const result = computeConfidence({
      name: 0.0, number: 0.0, denominator: 0.0,
      expansion: 0.0, variant: 0.0, normalization: 0.0,
    });
    expect(result.composite).toBeGreaterThan(0);
    expect(result.composite).toBeLessThan(0.05);
  });

  it('rounds to 3 decimal places', () => {
    const result = computeConfidence({
      name: 0.85, number: 1.0, denominator: 0.70,
      expansion: 0.60, variant: 0.95, normalization: 0.80,
    });
    const decimals = result.composite.toString().split('.')[1];
    expect(!decimals || decimals.length <= 3).toBe(true);
  });
});
