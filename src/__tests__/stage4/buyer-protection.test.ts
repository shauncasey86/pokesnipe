import { describe, expect, it } from 'vitest';
import { calculateBuyerProtection } from '../../services/pricing/buyer-protection.js';

describe('calculateBuyerProtection', () => {
  it('returns 0 for zero price', () => {
    expect(calculateBuyerProtection(0)).toBe(0);
  });

  it('calculates fee within first band only: £10 x 3% + £0.10 = £0.40', () => {
    expect(calculateBuyerProtection(10)).toBeCloseTo(0.4);
  });

  it('calculates fee across two bands: £50 = £0.30 + £2.00 + £0.10 = £2.40', () => {
    expect(calculateBuyerProtection(50)).toBeCloseTo(2.4);
  });

  it('calculates fee across three bands: £500 = £0.30 + £2.00 + £18.00 + £0.10 = £20.40', () => {
    expect(calculateBuyerProtection(500)).toBeCloseTo(20.4);
  });

  it('calculates fee across all four bands: £1000 = £0.30 + £2.00 + £18.00 + £10.00 + £0.10 = £30.40', () => {
    expect(calculateBuyerProtection(1000)).toBeCloseTo(30.4);
  });

  it('calculates fee for small item: £5 x 3% + £0.10 = £0.25', () => {
    expect(calculateBuyerProtection(5)).toBeCloseTo(0.25);
  });
});
