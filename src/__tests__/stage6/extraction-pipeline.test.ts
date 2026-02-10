import { describe, expect, it } from 'vitest';
import { extractSignals } from '../../services/extraction/index.js';

describe('extractSignals (full pipeline)', () => {
  it('rejects junk listings', () => {
    const result = extractSignals({
      itemId: '1',
      title: 'Pokemon Card Lot Bundle 50 Cards',
    });
    expect(result.rejected).toBe(true);
    expect(result.reason).toBe('bulk_lot');
    expect(result.listing).toBeUndefined();
  });

  it('processes a valid listing with all signals', () => {
    const result = extractSignals({
      itemId: '12345',
      title: 'Charizard ex 006/197 Holo Obsidian Flames NM',
      conditionDescriptors: [{ name: 'Card Condition', values: [{ content: 'Near Mint or Better' }] }],
      localizedAspects: [
        { name: 'Card Name', value: 'Charizard ex' },
        { name: 'Set', value: 'Obsidian Flames' },
        { name: 'Card Number', value: '006' },
      ],
    });

    expect(result.rejected).toBe(false);
    expect(result.listing).toBeDefined();
    const listing = result.listing!;
    expect(listing.ebayItemId).toBe('12345');
    expect(listing.cardName).toBe('Charizard ex');
    expect(listing.setName).toBe('Obsidian Flames');
    expect(listing.variant).toBe('holofoil');
    expect(listing.condition.condition).toBe('NM');
    expect(listing.condition.source).toBe('condition_descriptor');
    expect(listing.hasStructuredData).toBe(true);
  });

  it('processes a listing without structured data', () => {
    const result = extractSignals({
      itemId: '67890',
      title: 'Pikachu VMAX 044/185 Reverse Holo Vivid Voltage',
    });

    expect(result.rejected).toBe(false);
    const listing = result.listing!;
    expect(listing.cardNumber).toEqual({ number: 44, prefix: null, denominator: 185 });
    expect(listing.variant).toBe('reverseHolofoil');
    expect(listing.hasStructuredData).toBe(false);
    expect(listing.condition.source).toBe('default');
  });

  it('handles emoji-laden titles', () => {
    const result = extractSignals({
      itemId: '99',
      title: '🔥🔥 Charizard ex 006/197 🔥🔥',
    });

    expect(result.rejected).toBe(false);
    expect(result.listing!.cardNumber).toEqual({ number: 6, prefix: null, denominator: 197 });
    expect(result.listing!.cleanedTitle).toBe('charizard ex 006/197');
  });

  it('rejects fake cards', () => {
    const result = extractSignals({
      itemId: '2',
      title: 'Custom Proxy Charizard Orica Card',
    });
    expect(result.rejected).toBe(true);
    expect(result.reason).toBe('fake');
  });

  it('rejects non-card products', () => {
    const result = extractSignals({
      itemId: '3',
      title: 'Pokemon Booster Box Scarlet Violet 151',
    });
    expect(result.rejected).toBe(true);
    expect(result.reason).toBe('non_card');
  });
});
