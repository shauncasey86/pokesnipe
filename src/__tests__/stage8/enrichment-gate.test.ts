import { describe, it, expect } from 'vitest';
import { shouldEnrich } from '../../services/scanner/enrichment-gate.js';

describe('enrichment-gate', () => {
  const match = (profit: number, confidence: number, isDuplicate = false) => ({
    titleOnlyProfitPercent: profit,
    confidence: { composite: confidence },
    isDuplicate,
  });

  const budget = (remaining: number) => ({ remaining });

  describe('normal budget (≥500 remaining)', () => {
    it('enriches profitable + confident matches', () => {
      expect(shouldEnrich(match(20, 0.80), budget(4000))).toBe(true);
    });

    it('skips low profit (<15%)', () => {
      expect(shouldEnrich(match(10, 0.80), budget(4000))).toBe(false);
    });

    it('skips low confidence (<0.50)', () => {
      expect(shouldEnrich(match(30, 0.40), budget(4000))).toBe(false);
    });

    it('skips duplicates', () => {
      expect(shouldEnrich(match(30, 0.80, true), budget(4000))).toBe(false);
    });

    it('enriches at exactly 15% threshold', () => {
      expect(shouldEnrich(match(15, 0.50), budget(500))).toBe(true);
    });
  });

  describe('low budget (<500 remaining)', () => {
    it('raises threshold to 25%', () => {
      expect(shouldEnrich(match(20, 0.80), budget(300))).toBe(false); // 20% < 25%
    });

    it('enriches at 25%+ with low budget', () => {
      expect(shouldEnrich(match(30, 0.80), budget(300))).toBe(true); // 30% ≥ 25%
    });

    it('still requires minimum confidence', () => {
      expect(shouldEnrich(match(30, 0.40), budget(300))).toBe(false);
    });
  });
});
