import { describe, expect, it } from 'vitest';
import { calculateBuyerProtection } from '../../services/pricing/buyer-protection.js';

describe('calculateBuyerProtection', () => {
  it('returns 0 for zero price', () => {
    expect(calculateBuyerProtection(0)).toBe(0);
  });

  it('calculates fee within first band only: £5 x 7% + £0.10 = £0.45', () => {
    expect(calculateBuyerProtection(5)).toBeCloseTo(0.45);
  });

  it('calculates fee at first band ceiling: £20 x 7% + £0.10 = £1.50', () => {
    expect(calculateBuyerProtection(20)).toBeCloseTo(1.50);
  });

  it('calculates fee across two bands: £50 = (£20 x 7%) + (£30 x 4%) + £0.10 = £2.70', () => {
    expect(calculateBuyerProtection(50)).toBeCloseTo(2.70);
  });

  it('calculates fee across two bands at ceiling: £300 = (£20 x 7%) + (£280 x 4%) + £0.10 = £12.70', () => {
    expect(calculateBuyerProtection(300)).toBeCloseTo(12.70);
  });

  it('calculates fee across three bands: £500 = (£20 x 7%) + (£280 x 4%) + (£200 x 2%) + £0.10 = £16.70', () => {
    expect(calculateBuyerProtection(500)).toBeCloseTo(16.70);
  });

  it('calculates fee across all bands: £1000 = (£20 x 7%) + (£280 x 4%) + (£700 x 2%) + £0.10 = £26.70', () => {
    expect(calculateBuyerProtection(1000)).toBeCloseTo(26.70);
  });

  it('caps fee at £4000 — no additional fee above that: £5000 same as £4000', () => {
    // £4000: (£20 x 7%) + (£280 x 4%) + (£3700 x 2%) + £0.10 = £86.70
    expect(calculateBuyerProtection(4000)).toBeCloseTo(86.70);
    expect(calculateBuyerProtection(5000)).toBeCloseTo(86.70);
  });
});
