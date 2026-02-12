import { describe, expect, it } from 'vitest';
import { detectJunk, detectDescriptionJunk } from '../../services/extraction/junk-detector.js';

describe('detectJunk', () => {
  describe('bulk_lot detection', () => {
    it('detects lot keyword', () => {
      expect(detectJunk('pokemon card lot bundle x50')).toEqual({ isJunk: true, reason: 'bulk_lot' });
    });

    it('detects mystery bags', () => {
      expect(detectJunk('mystery grab bag 10 random cards')).toEqual({ isJunk: true, reason: 'bulk_lot' });
    });

    it('detects bundle', () => {
      expect(detectJunk('pokemon bundle 20 cards')).toEqual({ isJunk: true, reason: 'bulk_lot' });
    });

    it('does not false positive on collection (appears in product names)', () => {
      expect(detectJunk('espeon ex premium figure collection promo card')).toEqual({ isJunk: false });
    });

    it('does not false positive on lot inside words', () => {
      expect(detectJunk('charlotte pikachu card')).toEqual({ isJunk: false });
    });
  });

  describe('fake detection', () => {
    it('detects custom proxy cards', () => {
      expect(detectJunk('custom proxy charizard orica')).toEqual({ isJunk: true, reason: 'fake' });
    });

    it('detects replica cards', () => {
      expect(detectJunk('replica charizard base set')).toEqual({ isJunk: true, reason: 'fake' });
    });

    it('detects fan made cards', () => {
      expect(detectJunk('fan made pikachu card')).toEqual({ isJunk: true, reason: 'fake' });
    });

    it('detects fan art cards', () => {
      expect(detectJunk('fan art charizard card')).toEqual({ isJunk: true, reason: 'fake' });
    });

    it('detects fanart (no space)', () => {
      expect(detectJunk('fanart pikachu custom')).toEqual({ isJunk: true, reason: 'fake' });
    });

    it('detects hand painted cards', () => {
      expect(detectJunk('hand painted charizard card')).toEqual({ isJunk: true, reason: 'fake' });
    });

    it('detects hand drawn cards', () => {
      expect(detectJunk('hand drawn pikachu card')).toEqual({ isJunk: true, reason: 'fake' });
    });
  });

  describe('non_card detection', () => {
    it('detects booster boxes', () => {
      expect(detectJunk('pokemon booster box scarlet violet')).toEqual({ isJunk: true, reason: 'non_card' });
    });

    it('detects ETBs', () => {
      expect(detectJunk('pokemon etb elite trainer box')).toEqual({ isJunk: true, reason: 'non_card' });
    });

    it('detects code cards', () => {
      expect(detectJunk('online code card ptcgo')).toEqual({ isJunk: true, reason: 'non_card' });
    });

    it('detects playing cards', () => {
      expect(detectJunk('pokemon all star kyogre 9 of hearts playing card 2017')).toEqual({ isJunk: true, reason: 'non_card' });
    });

    it('detects poker cards', () => {
      expect(detectJunk('pokemon poker card deck pikachu')).toEqual({ isJunk: true, reason: 'non_card' });
    });

    it('detects topps products', () => {
      expect(detectJunk('pokemon topps chrome charizard')).toEqual({ isJunk: true, reason: 'non_card' });
    });

    it('detects coins', () => {
      expect(detectJunk('pikachu coin gold metal pokemon')).toEqual({ isJunk: true, reason: 'non_card' });
    });
  });

  describe('non_english detection (language words)', () => {
    it('detects japanese cards by word', () => {
      expect(detectJunk('pokemon japanese chansey my deck memo card 1997')).toEqual({ isJunk: true, reason: 'non_english' });
    });

    it('detects korean cards by word', () => {
      expect(detectJunk('pokemon card genesect ex 083/078 sr 1st edition korean')).toEqual({ isJunk: true, reason: 'non_english' });
    });

    it('detects chinese cards by word', () => {
      expect(detectJunk('charizard ex chinese s-chinese pokemon card')).toEqual({ isJunk: true, reason: 'non_english' });
    });

    it('detects thai cards by word', () => {
      expect(detectJunk('pikachu vmax thai pokemon card')).toEqual({ isJunk: true, reason: 'non_english' });
    });
  });

  describe('real cards pass through', () => {
    it('allows real card listings', () => {
      expect(detectJunk('charizard ex 006/197 obsidian flames')).toEqual({ isJunk: false });
    });

    it('allows vivid voltage cards', () => {
      expect(detectJunk('pikachu vmax 044/185 vivid voltage')).toEqual({ isJunk: false });
    });

    it('allows graded cards', () => {
      expect(detectJunk('psa 10 charizard base set')).toEqual({ isJunk: false });
    });
  });
});

describe('detectDescriptionJunk', () => {
  it('detects fan art in HTML description', () => {
    const desc = '<p>Beautiful <b>fan art</b> Charizard card, hand made with love!</p>';
    expect(detectDescriptionJunk(desc, null)).toEqual({ isJunk: true, reason: 'fake_description' });
  });

  it('detects fanart in shortDescription', () => {
    expect(detectDescriptionJunk(null, 'Custom fanart Pokemon card')).toEqual({ isJunk: true, reason: 'fake_description' });
  });

  it('detects proxy in description', () => {
    const desc = 'This is a high-quality proxy card for casual play.';
    expect(detectDescriptionJunk(desc, null)).toEqual({ isJunk: true, reason: 'fake_description' });
  });

  it('passes clean descriptions', () => {
    const desc = '<p>Near mint Charizard ex from Obsidian Flames. Ships in toploader.</p>';
    expect(detectDescriptionJunk(desc, null)).toEqual({ isJunk: false });
  });

  it('returns clean when both fields are null', () => {
    expect(detectDescriptionJunk(null, null)).toEqual({ isJunk: false });
  });

  it('returns clean when both fields are undefined', () => {
    expect(detectDescriptionJunk(undefined, undefined)).toEqual({ isJunk: false });
  });
});
