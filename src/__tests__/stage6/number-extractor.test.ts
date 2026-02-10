import { describe, expect, it } from 'vitest';
import { extractCardNumber } from '../../services/extraction/number-extractor.js';

describe('extractCardNumber', () => {
  it('extracts standard fraction format', () => {
    expect(extractCardNumber('charizard 006/197')).toEqual({
      number: 6,
      prefix: null,
      denominator: 197,
    });
  });

  it('extracts prefix format (SV)', () => {
    expect(extractCardNumber('sv065/198 iono sar')).toEqual({
      number: 65,
      prefix: 'SV',
      denominator: 198,
    });
  });

  it('extracts trainer gallery format', () => {
    expect(extractCardNumber('tg15/tg30 pikachu')).toEqual({
      number: 15,
      prefix: 'TG',
      denominator: 30,
    });
  });

  it('extracts hash format', () => {
    expect(extractCardNumber('mewtwo #150')).toEqual({
      number: 150,
      prefix: null,
      denominator: null,
    });
  });

  it('extracts No. format', () => {
    expect(extractCardNumber('pikachu no. 25')).toEqual({
      number: 25,
      prefix: null,
      denominator: null,
    });
  });

  it('returns null when no number found', () => {
    expect(extractCardNumber('pokemon card holo rare')).toBeNull();
  });

  it('strips leading zeros', () => {
    expect(extractCardNumber('card 001/100')).toEqual({
      number: 1,
      prefix: null,
      denominator: 100,
    });
  });

  it('handles GG prefix', () => {
    expect(extractCardNumber('gg05/gg70')).toEqual({
      number: 5,
      prefix: 'GG',
      denominator: 70,
    });
  });

  it('handles SWSH prefix', () => {
    expect(extractCardNumber('swsh077/202')).toEqual({
      number: 77,
      prefix: 'SWSH',
      denominator: 202,
    });
  });
});
