import { describe, it, expect } from 'vitest';
import { resolveVariant } from '../../services/matching/variant-resolver.js';
import type { VariantCandidate } from '../../services/matching/variant-resolver.js';

function makeVariant(name: string, nmMarket: number | null): VariantCandidate {
  const prices: Record<string, Record<string, { low: number; market: number }>> = {};
  if (nmMarket != null) {
    prices['raw'] = { NM: { low: nmMarket * 0.8, market: nmMarket } };
  }
  return { id: Math.floor(Math.random() * 10000), name, prices, gradedPrices: null };
}

describe('resolveVariant', () => {
  it('returns null for empty variants', () => {
    expect(resolveVariant(null, [])).toBeNull();
  });

  it('returns null when no variant has pricing', () => {
    expect(resolveVariant(null, [makeVariant('holofoil', null)])).toBeNull();
  });

  it('auto-selects single priced variant (single_variant)', () => {
    const result = resolveVariant(null, [makeVariant('holofoil', 50)]);
    expect(result).not.toBeNull();
    expect(result!.method).toBe('single_variant');
    expect(result!.confidence).toBe(0.95);
    expect(result!.variant.name).toBe('holofoil');
  });

  it('matches by keyword (keyword_match)', () => {
    const variants = [
      makeVariant('holofoil', 100),
      makeVariant('reverseHolofoil', 30),
    ];
    const result = resolveVariant('reverse holo', variants);
    expect(result).not.toBeNull();
    expect(result!.method).toBe('keyword_match');
    expect(result!.confidence).toBe(0.85);
    expect(result!.variant.name).toBe('reverseHolofoil');
  });

  it('matches by direct name (keyword_match)', () => {
    const variants = [
      makeVariant('holofoil', 100),
      makeVariant('reverseHolofoil', 30),
    ];
    const result = resolveVariant('reverseHolofoil', variants);
    expect(result).not.toBeNull();
    expect(result!.method).toBe('keyword_match');
    expect(result!.variant.name).toBe('reverseHolofoil');
  });

  it('defaults to cheapest when no keyword match (default_cheapest)', () => {
    const variants = [
      makeVariant('holofoil', 100),
      makeVariant('reverseHolofoil', 30),
    ];
    const result = resolveVariant(null, variants);
    expect(result).not.toBeNull();
    expect(result!.method).toBe('default_cheapest');
    expect(result!.confidence).toBe(0.50);
    expect(result!.variant.name).toBe('reverseHolofoil'); // 30 < 100
  });

  it('defaults to cheapest for unrecognized variant signal', () => {
    const variants = [
      makeVariant('holofoil', 100),
      makeVariant('reverseHolofoil', 30),
    ];
    const result = resolveVariant('some unknown variant', variants);
    expect(result).not.toBeNull();
    expect(result!.method).toBe('default_cheapest');
  });

  it('matches SIR keyword to specialIllustrationRare variant', () => {
    const variants = [
      makeVariant('holofoil', 5),
      makeVariant('specialIllustrationRare', 200),
    ];
    const result = resolveVariant('special illustration rare', variants);
    expect(result).not.toBeNull();
    expect(result!.method).toBe('keyword_match');
    expect(result!.variant.name).toBe('specialIllustrationRare');
  });

  it('matches SAR keyword to specialArtRare variant', () => {
    const variants = [
      makeVariant('holofoil', 10),
      makeVariant('specialArtRare', 150),
    ];
    const result = resolveVariant('special art rare', variants);
    expect(result).not.toBeNull();
    expect(result!.method).toBe('keyword_match');
    expect(result!.variant.name).toBe('specialArtRare');
  });

  it('matches short "sir" abbreviation to specialIllustrationRare', () => {
    const variants = [
      makeVariant('holofoil', 5),
      makeVariant('specialIllustrationRare', 200),
    ];
    const result = resolveVariant('sir', variants);
    expect(result).not.toBeNull();
    expect(result!.method).toBe('keyword_match');
    expect(result!.variant.name).toBe('specialIllustrationRare');
  });
});
