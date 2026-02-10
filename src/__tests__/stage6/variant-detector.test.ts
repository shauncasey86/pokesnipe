import { describe, expect, it } from 'vitest';
import { detectVariant } from '../../services/extraction/variant-detector.js';

describe('detectVariant', () => {
  it('detects reverse holo', () => {
    expect(detectVariant('reverse holo charizard')).toBe('reverseHolofoil');
  });

  it('detects holo rare', () => {
    expect(detectVariant('holo rare pikachu')).toBe('holofoil');
  });

  it('detects 1st edition holo', () => {
    expect(detectVariant('1st edition holo charizard')).toBe('firstEditionHolofoil');
  });

  it('detects 1st edition (non-holo)', () => {
    expect(detectVariant('1st edition dark blastoise')).toBe('firstEditionNormal');
  });

  it('returns null for no variant keywords', () => {
    expect(detectVariant('charizard ex 006/197')).toBeNull();
  });

  it('detects reverse holographic', () => {
    expect(detectVariant('reverse holographic pikachu')).toBe('reverseHolofoil');
  });

  it('detects first edition (spelled out)', () => {
    expect(detectVariant('first edition holo machamp')).toBe('firstEditionHolofoil');
  });

  it('detects unlimited holo', () => {
    expect(detectVariant('unlimited holo charizard')).toBe('unlimitedHolofoil');
  });

  it('detects unlimited (non-holo)', () => {
    expect(detectVariant('unlimited charizard base set')).toBe('unlimitedNormal');
  });

  it('detects full art', () => {
    expect(detectVariant('full art pikachu vmax')).toBe('full art');
  });

  it('detects alt art', () => {
    expect(detectVariant('alt art umbreon vmax')).toBe('alt art');
  });

  it('detects secret rare', () => {
    expect(detectVariant('secret rare charizard gold')).toBe('secret rare');
  });

  it('detects shadowless', () => {
    expect(detectVariant('shadowless charizard base set')).toBe('shadowless');
  });

  it('prioritizes reverse holo over holo', () => {
    expect(detectVariant('reverse holo charizard holo rare')).toBe('reverseHolofoil');
  });
});
