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
        rawDescriptorIds: ['400010'],
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
        rawDescriptorIds: [],
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
        rawDescriptorIds: [],
      },
      { itemId: '789', title: 'Some Card', cleanedTitle: 'some card' },
    );
    expect(result.ebayItemId).toBe('789');
    expect(result.ebayTitle).toBe('Some Card');
    expect(result.cleanedTitle).toBe('some card');
  });

  it('parses structured cardNumber fraction format', () => {
    const result = mergeSignals(
      { cardNumber: { number: 2, prefix: null, denominator: 132 }, variant: 'holofoil' },
      {
        cardName: "Blaine's Charizard",
        setName: 'Gym Challenge',
        cardNumber: '2/132',
        rarity: null,
        language: null,
        gradingCompany: null,
        grade: null,
        year: null,
      },
      {
        condition: 'NM',
        source: 'condition_descriptor',
        isGraded: true,
        gradingCompany: 'PSA',
        grade: '8',
        certNumber: '133380695',
        rawDescriptorIds: [],
      },
      { itemId: 'x', title: "Blaine's Charizard 2/132", cleanedTitle: "blaine's charizard 2/132" },
    );
    expect(result.cardNumber).toEqual({ number: 2, prefix: null, denominator: 132 });
    expect(result.signalSources['cardNumber']).toBe('structured');
  });

  it('parses structured cardNumber with leading zeros', () => {
    const result = mergeSignals(
      { cardNumber: null, variant: null },
      {
        cardName: 'Charizard ex',
        setName: 'Obsidian Flames',
        cardNumber: '125/094',
        rarity: null,
        language: null,
        gradingCompany: null,
        grade: null,
        year: null,
      },
      {
        condition: 'LP',
        source: 'default',
        isGraded: false,
        gradingCompany: null,
        grade: null,
        certNumber: null,
        rawDescriptorIds: [],
      },
      { itemId: 'y', title: 'Charizard 125/094', cleanedTitle: 'charizard 125/094' },
    );
    expect(result.cardNumber).toEqual({ number: 125, prefix: null, denominator: 94 });
  });

  it('parses structured promo cardNumber (sm60)', () => {
    const result = mergeSignals(
      { cardNumber: { number: 60, prefix: 'SM', denominator: null }, variant: null },
      {
        cardName: 'Charizard GX',
        setName: 'Hidden Fates: Shiny Vault',
        cardNumber: 'sm60',
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
        rawDescriptorIds: [],
      },
      { itemId: 'z', title: 'Charizard GX SM60', cleanedTitle: 'charizard gx sm60' },
    );
    expect(result.cardNumber).toEqual({ number: 60, prefix: 'SM', denominator: null });
    expect(result.signalSources['cardNumber']).toBe('structured');
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
        rawDescriptorIds: [],
      },
      { itemId: '111', title: 'NM Pikachu', cleanedTitle: 'nm pikachu' },
    );
    expect(result.signalSources['condition']).toBe('title');
  });

  it('passes rarity/language/year from structured data', () => {
    const result = mergeSignals(
      { cardNumber: null, variant: null },
      {
        cardName: 'Charizard ex',
        setName: 'Obsidian Flames',
        cardNumber: null,
        rarity: 'Illustration Rare',
        language: 'Japanese',
        gradingCompany: null,
        grade: null,
        year: '2023',
      },
      {
        condition: 'NM',
        source: 'condition_descriptor',
        isGraded: false,
        gradingCompany: null,
        grade: null,
        certNumber: null,
        rawDescriptorIds: [],
      },
      { itemId: '222', title: 'Charizard ex', cleanedTitle: 'charizard ex' },
    );
    expect(result.rarity).toBe('Illustration Rare');
    expect(result.language).toBe('Japanese');
    expect(result.year).toBe('2023');
    expect(result.signalSources['rarity']).toBe('structured');
    expect(result.signalSources['language']).toBe('structured');
    expect(result.signalSources['year']).toBe('structured');
  });

  it('rarity/language/year are null without structured data', () => {
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
        rawDescriptorIds: [],
      },
      { itemId: '333', title: 'Pikachu', cleanedTitle: 'pikachu' },
    );
    expect(result.rarity).toBeNull();
    expect(result.language).toBeNull();
    expect(result.year).toBeNull();
  });
});
