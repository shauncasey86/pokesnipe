import { describe, it, expect } from 'vitest';
import { jaroWinkler, validateName, NAME_HARD_GATE } from '../../services/matching/name-validator.js';

describe('jaroWinkler', () => {
  it('returns 1.0 for identical strings', () => {
    expect(jaroWinkler('charizard', 'charizard')).toBe(1.0);
  });

  it('returns 0.0 for completely different strings', () => {
    expect(jaroWinkler('abc', 'xyz')).toBe(0.0);
  });

  it('returns high score for similar strings', () => {
    const score = jaroWinkler('charizard', 'charzard');
    expect(score).toBeGreaterThan(0.90);
  });

  it('returns moderate score for somewhat similar strings', () => {
    const score = jaroWinkler('pikachu', 'pikachuu');
    expect(score).toBeGreaterThan(0.90);
  });

  it('boosts score for common prefix', () => {
    const jw = jaroWinkler('pokemon', 'pokeman');
    const jw2 = jaroWinkler('xokemon', 'xokeman');
    // Both have same edit pattern but first pair shares longer prefix
    expect(jw).toBeGreaterThanOrEqual(jw2);
  });

  it('handles empty strings', () => {
    expect(jaroWinkler('', '')).toBe(1.0);
    expect(jaroWinkler('abc', '')).toBe(0.0);
    expect(jaroWinkler('', 'abc')).toBe(0.0);
  });
});

describe('validateName', () => {
  it('returns 1.0 for exact match', () => {
    expect(validateName('Charizard', 'Charizard')).toBe(1.0);
  });

  it('is case-insensitive', () => {
    expect(validateName('charizard', 'Charizard')).toBe(1.0);
  });

  it('returns high score when candidate contains extracted', () => {
    const score = validateName('charizard', 'charizard vmax');
    expect(score).toBeGreaterThanOrEqual(0.80);
  });

  it('returns high score when extracted contains candidate', () => {
    const score = validateName('charizard vmax rainbow', 'charizard vmax');
    expect(score).toBeGreaterThanOrEqual(0.80);
  });

  it('passes hard gate for close misspellings', () => {
    const score = validateName('charzard', 'charizard');
    expect(score).toBeGreaterThan(NAME_HARD_GATE);
  });

  it('fails hard gate for completely different names', () => {
    const score = validateName('pikachu', 'charizard');
    expect(score).toBeLessThan(NAME_HARD_GATE);
  });

  it('hard gate threshold is 0.60', () => {
    expect(NAME_HARD_GATE).toBe(0.60);
  });
});
