import { describe, it, expect } from 'vitest';
import { classifyConfidence, passesGate } from '../../services/matching/gates.js';

describe('classifyConfidence', () => {
  it('classifies >= 0.85 as high', () => {
    expect(classifyConfidence(0.85)).toBe('high');
    expect(classifyConfidence(0.99)).toBe('high');
    expect(classifyConfidence(1.0)).toBe('high');
  });

  it('classifies 0.65-0.84 as medium', () => {
    expect(classifyConfidence(0.65)).toBe('medium');
    expect(classifyConfidence(0.75)).toBe('medium');
    expect(classifyConfidence(0.84)).toBe('medium');
  });

  it('classifies 0.45-0.64 as low', () => {
    expect(classifyConfidence(0.45)).toBe('low');
    expect(classifyConfidence(0.55)).toBe('low');
    expect(classifyConfidence(0.64)).toBe('low');
  });

  it('classifies < 0.45 as reject', () => {
    expect(classifyConfidence(0.44)).toBe('reject');
    expect(classifyConfidence(0.20)).toBe('reject');
    expect(classifyConfidence(0.0)).toBe('reject');
  });
});

describe('passesGate', () => {
  it('passes for high confidence', () => {
    expect(passesGate(0.90)).toBe(true);
  });

  it('passes for medium confidence', () => {
    expect(passesGate(0.70)).toBe(true);
  });

  it('passes for low confidence', () => {
    expect(passesGate(0.50)).toBe(true);
  });

  it('passes at exactly 0.45', () => {
    expect(passesGate(0.45)).toBe(true);
  });

  it('rejects below 0.45', () => {
    expect(passesGate(0.44)).toBe(false);
    expect(passesGate(0.30)).toBe(false);
    expect(passesGate(0.0)).toBe(false);
  });
});
