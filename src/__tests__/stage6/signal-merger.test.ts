import { describe, expect, it } from 'vitest';
import { mergeSignals } from '../../services/extraction/signal-merger.js';

describe('mergeSignals', () => {
  it('structured data overrides title data', () => {
    const result = mergeSignals(
      { cardNumber: { number: 6, prefix: null, denominator: 197 }, variant: 'holofoil' },
      {
        cardName: 'Charizard ex',
        setName: 'Obsidian Flames',
        cardNumber: '006',
        rarity: null,
        language: null,
        gradingCompany: null,
        grade: null,
        year: null,
      },
      {
        condition: 'NM',
        source: 'condition_descriptor',
        isGraded: false,
        gradingCompany: null,
        grade: null,
        certNumber: null,
        rawDescriptors: ['400010'],
      },
      { itemId: '123', title: 'Charizard ex 006/197', cleanedTitle: 'charizard ex 006/197' },
    );
    expect(result.cardName).toBe('Charizard ex');
    expect(result.condition.condition).toBe('NM');
    expect(result.hasStructuredData).toBe(true);
    expect(result.signalSources['cardName']).toBe('structured');
    expect(result.signalSources['cardNumber']).toBe('structured');
    expect(result.signalSources['setName']).toBe('structured');
  });

  it('uses title signals when no structured data', () => {
    const result = mergeSignals(
      { cardNumber: { number: 6, prefix: null, denominator: 197 }, variant: 'holofoil' },
      null,
      {
        condition: 'LP',
        source: 'default',
        isGraded: false,
        gradingCompany: null,
        grade: null,
        certNumber: null,
        rawDescriptors: [],
      },
      { itemId: '456', title: 'Charizard 006/197', cleanedTitle: 'charizard 006/197' },
    );
    expect(result.cardName).toBeNull();
    expect(result.cardNumber).toEqual({ number: 6, prefix: null, denominator: 197 });
    expect(result.variant).toBe('holofoil');
    expect(result.hasStructuredData).toBe(false);
    expect(result.signalSources['cardNumber']).toBe('title');
    expect(result.signalSources['variant']).toBe('title');
  });

  it('preserves eBay metadata', () => {
    const result = mergeSignals(
      { cardNumber: null, variant: null },
      null,
      {
        condition: 'LP',
        source: 'default',
        isGraded: false,
        gradingCompany: null,
        grade: null,
        certNumber: null,
        rawDescriptors: [],
      },
      { itemId: '789', title: 'Some Card', cleanedTitle: 'some card' },
    );
    expect(result.ebayItemId).toBe('789');
    expect(result.ebayTitle).toBe('Some Card');
    expect(result.cleanedTitle).toBe('some card');
  });

  it('tracks condition source', () => {
    const result = mergeSignals(
      { cardNumber: null, variant: null },
      null,
      {
        condition: 'NM',
        source: 'title',
        isGraded: false,
        gradingCompany: null,
        grade: null,
        certNumber: null,
        rawDescriptors: [],
      },
      { itemId: '111', title: 'NM Pikachu', cleanedTitle: 'nm pikachu' },
    );
    expect(result.signalSources['condition']).toBe('title');
  });
});
