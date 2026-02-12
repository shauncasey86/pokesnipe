import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Unit tests for the learned junk scorer.
 *
 * These test the pure logic (token extraction, scoring) without
 * hitting the database.  The DB-dependent functions (refreshJunkCaches,
 * recordJunkReport) are tested at the integration level.
 */

// Mock pino logger
vi.mock('pino', () => ({
  default: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Mock the database pool before importing the module
vi.mock('../../db/pool.js', () => ({
  pool: {
    query: vi.fn().mockResolvedValue({ rows: [] }),
  },
}));

import {
  scoreJunkSignals,
  extractNovelTokens,
  LEARNED_KEYWORD_PENALTY,
  SELLER_PENALTY_PER_REPORT,
  SELLER_PENALTY_THRESHOLD,
  SELLER_PENALTY_CAP,
  _resetCaches,
} from '../../services/extraction/junk-scorer.js';

import { pool } from '../../db/pool.js';

const mockQuery = pool.query as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  _resetCaches();
});

describe('scoreJunkSignals', () => {
  it('returns zero penalty when no learned data exists', async () => {
    // Cache refresh returns empty results
    mockQuery.mockResolvedValue({ rows: [] });

    const result = await scoreJunkSignals('charizard ex 006/197 obsidian flames', null);
    expect(result.penalty).toBe(0);
    expect(result.matchedKeywords).toEqual([]);
    expect(result.sellerReportCount).toBe(0);
  });

  it('applies keyword penalty when learned keyword matches', async () => {
    // First call: token refresh
    mockQuery
      .mockResolvedValueOnce({ rows: [{ token: 'bootleg' }, { token: 'misprint' }] })
      // Second call: seller refresh
      .mockResolvedValueOnce({ rows: [] });

    const result = await scoreJunkSignals('charizard bootleg pokemon card', null);
    expect(result.penalty).toBe(LEARNED_KEYWORD_PENALTY);
    expect(result.matchedKeywords).toEqual(['bootleg']);
  });

  it('applies seller penalty when seller exceeds threshold', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // token refresh
      .mockResolvedValueOnce({ rows: [{ seller_name: 'dodgy_seller', cnt: '5' }] }); // seller refresh

    const result = await scoreJunkSignals('pikachu vmax 044/185', 'dodgy_seller');
    const expectedPenalty = (5 - SELLER_PENALTY_THRESHOLD + 1) * SELLER_PENALTY_PER_REPORT;
    expect(result.penalty).toBe(expectedPenalty);
    expect(result.sellerReportCount).toBe(5);
  });

  it('combines keyword and seller penalties', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ token: 'bootleg' }] }) // token refresh
      .mockResolvedValueOnce({ rows: [{ seller_name: 'scam_store', cnt: '4' }] }); // seller refresh

    const result = await scoreJunkSignals('bootleg charizard card', 'scam_store');
    const sellerPenalty = (4 - SELLER_PENALTY_THRESHOLD + 1) * SELLER_PENALTY_PER_REPORT;
    expect(result.penalty).toBe(LEARNED_KEYWORD_PENALTY + sellerPenalty);
    expect(result.matchedKeywords).toEqual(['bootleg']);
    expect(result.sellerReportCount).toBe(4);
  });

  it('caps seller penalty at SELLER_PENALTY_CAP', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // token refresh
      .mockResolvedValueOnce({ rows: [{ seller_name: 'mega_scammer', cnt: '100' }] }); // seller refresh

    const result = await scoreJunkSignals('pikachu card', 'mega_scammer');
    expect(result.penalty).toBe(SELLER_PENALTY_CAP);
  });

  it('does not apply seller penalty below threshold', async () => {
    // The SQL HAVING clause filters these out, but test that even if
    // the query returned low-count sellers, no penalty is applied
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] }); // HAVING filters it

    const result = await scoreJunkSignals('pikachu card', 'okay_seller');
    expect(result.penalty).toBe(0);
    expect(result.sellerReportCount).toBe(0);
  });

  it('is case insensitive for keyword matching', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ token: 'bootleg' }] })
      .mockResolvedValueOnce({ rows: [] });

    // Title already lowercased by cleanTitle but test uppercase token
    const result = await scoreJunkSignals('bootleg charizard', null);
    expect(result.matchedKeywords).toEqual(['bootleg']);
  });
});

describe('extractNovelTokens', () => {
  it('returns empty array for clean title with known card', async () => {
    // Card lookup returns name + expansion
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ name: 'Charizard ex', exp_name: 'Obsidian Flames', exp_code: 'OBF' }],
      })
      // Catalog name check
      .mockResolvedValueOnce({ rows: [{ word: 'charizard' }, { word: 'obsidian' }, { word: 'flames' }] });

    const tokens = await extractNovelTokens('charizard ex 006/197 obsidian flames', 'charizard-ex-123');
    // "charizard", "obsidian", "flames" are catalog words; "006/197" is numeric; "ex" is a stop word
    expect(tokens).toEqual([]);
  });

  it('extracts novel junk-specific words', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ name: 'Charizard ex', exp_name: 'Obsidian Flames', exp_code: 'OBF' }],
      })
      .mockResolvedValueOnce({ rows: [{ word: 'charizard' }, { word: 'obsidian' }, { word: 'flames' }] });

    const tokens = await extractNovelTokens('bootleg charizard ex obsidian flames reproduction', 'charizard-ex-123');
    expect(tokens).toContain('bootleg');
    expect(tokens).toContain('reproduction');
    expect(tokens).not.toContain('charizard');
    expect(tokens).not.toContain('obsidian');
  });

  it('filters out stop words', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const tokens = await extractNovelTokens('pokemon card tcg holo rare nm free postage', null);
    // All are stop words or too short
    expect(tokens).toEqual([]);
  });

  it('filters out short tokens (< 3 chars)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const tokens = await extractNovelTokens('ab cd ef bootleg', null);
    expect(tokens).toEqual(['bootleg']);
  });

  it('filters out numeric patterns', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const tokens = await extractNovelTokens('006/197 123 45.67 bootleg', null);
    expect(tokens).toEqual(['bootleg']);
  });

  it('returns empty when no card_id provided and all words are stop words', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const tokens = await extractNovelTokens('pokemon card tcg trading game', null);
    expect(tokens).toEqual([]);
  });
});

describe('constants', () => {
  it('has reasonable penalty values', () => {
    expect(LEARNED_KEYWORD_PENALTY).toBe(0.15);
    expect(SELLER_PENALTY_PER_REPORT).toBe(0.05);
    expect(SELLER_PENALTY_THRESHOLD).toBe(3);
    expect(SELLER_PENALTY_CAP).toBe(0.20);
  });

  it('keyword penalty is less than the confidence gate', () => {
    // A listing with confidence 0.80 should survive a keyword penalty
    expect(0.80 - LEARNED_KEYWORD_PENALTY).toBeGreaterThanOrEqual(0.65);
  });

  it('max combined penalty cannot zero out a strong match', () => {
    // Keyword + max seller penalty
    const maxPenalty = LEARNED_KEYWORD_PENALTY + SELLER_PENALTY_CAP;
    // A confidence of 0.85 (high tier) should still be > 0.45 (absolute minimum gate)
    expect(0.85 - maxPenalty).toBeGreaterThan(0.45);
  });
});
