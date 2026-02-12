import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EbayItemSummary, EbayItemDetail, EbaySearchResponse, BudgetStatus } from '../../services/ebay/types.js';
import type { MatchResult } from '../../services/matching/index.js';

// ── Mock I/O boundaries (eBay, DB, matching, exchange rate) ──────────────

vi.mock('../../services/ebay/index.js', () => ({
  searchItems: vi.fn(),
  getItem: vi.fn(),
  canMakeCall: vi.fn(),
  getBudgetStatus: vi.fn(),
}));

vi.mock('../../services/matching/index.js', () => ({
  matchListing: vi.fn(),
}));

vi.mock('../../services/exchange-rate/exchange-rate-service.js', () => ({
  getValidRate: vi.fn(),
}));

vi.mock('../../services/scanner/deduplicator.js', () => ({
  isDuplicate: vi.fn(),
  markProcessed: vi.fn(),
}));

vi.mock('../../services/scanner/deal-creator.js', () => ({
  createDeal: vi.fn(),
}));

vi.mock('../../services/liquidity/index.js', () => ({
  calculateLiquidity: vi.fn(),
  getVelocity: vi.fn(),
  adjustTierForLiquidity: vi.fn(),
}));

vi.mock('../../services/notifications/deal-alerts.js', () => ({
  sendDealAlert: vi.fn(),
}));

// Suppress pino log noise in tests
vi.mock('pino', () => ({
  default: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  }),
}));

// ── Import mocked modules for configuration ─────────────────────────────

import { searchItems, getItem, canMakeCall, getBudgetStatus } from '../../services/ebay/index.js';
import { matchListing } from '../../services/matching/index.js';
import { getValidRate } from '../../services/exchange-rate/exchange-rate-service.js';
import { isDuplicate, markProcessed } from '../../services/scanner/deduplicator.js';
import { createDeal } from '../../services/scanner/deal-creator.js';
import { calculateLiquidity, getVelocity, adjustTierForLiquidity } from '../../services/liquidity/index.js';
import { sendDealAlert } from '../../services/notifications/deal-alerts.js';

// ── Import module under test ─────────────────────────────────────────────

import { runScanCycle } from '../../services/scanner/scanner-service.js';

// ── Test fixtures ────────────────────────────────────────────────────────

const EXCHANGE_RATE = 0.79; // USD → GBP

function makeListing(overrides: Partial<EbayItemSummary> = {}): EbayItemSummary {
  return {
    itemId: 'v1|123456789|0',
    title: 'Charizard VMAX 020/189 Darkness Ablaze Holo Near Mint',
    price: { value: '15.00', currency: 'GBP' },
    shippingOptions: [
      { shippingCostType: 'FIXED', shippingCost: { value: '1.50', currency: 'GBP' } },
    ],
    condition: 'Used',
    conditionId: '4000',
    image: { imageUrl: 'https://i.ebayimg.com/images/g/abc/s-l1600.jpg' },
    itemWebUrl: 'https://www.ebay.co.uk/itm/123456789',
    seller: { username: 'pokefan99', feedbackScore: 150, feedbackPercentage: '99.5' },
    itemCreationDate: '2024-01-15T10:30:00.000Z',
    buyingOptions: ['FIXED_PRICE'],
    ...overrides,
  };
}

function makeSearchResponse(listings: EbayItemSummary[]): EbaySearchResponse {
  return {
    href: 'https://api.ebay.com/buy/browse/v1/item_summary/search',
    total: listings.length,
    limit: 200,
    offset: 0,
    itemSummaries: listings,
  };
}

function makeMatchResult(overrides: Partial<MatchResult> = {}): MatchResult {
  return {
    card: { scrydexCardId: 'card-xyz-123', name: 'Charizard VMAX', number: '020' },
    variant: {
      id: 42,
      name: 'holofoil',
      prices: { NM: { low: 40, market: 50 }, LP: { low: 30, market: 38 } },
      gradedPrices: null,
    },
    confidence: {
      composite: 0.88,
      name: 0.95,
      number: 1.0,
      denominator: 1.0,
      expansion: 0.80,
      variant: 0.85,
      normalization: 0.75,
    },
    strategy: 'number_denominator',
    variantMethod: 'keyword_match',
    ...overrides,
  };
}

function makeEnrichedItem(listing: EbayItemSummary): EbayItemDetail {
  return {
    ...listing,
    localizedAspects: [
      { type: 'PRODUCT', name: 'Card Name', value: 'Charizard VMAX' },
      { type: 'PRODUCT', name: 'Set', value: 'Darkness Ablaze' },
      { type: 'PRODUCT', name: 'Card Number', value: '020/189' },
    ],
    conditionDescriptors: [
      { name: '40001', values: [{ content: '400010' }] }, // NM
    ],
  };
}

function makeBudgetStatus(overrides: Partial<BudgetStatus> = {}): BudgetStatus {
  return {
    dailyLimit: 5000,
    used: 100,
    remaining: 4900,
    resetAt: new Date(Date.now() + 86400000),
    isLow: false,
    ...overrides,
  };
}

// ── Setup defaults ───────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks();

  // Defaults: budget OK, no duplicates, valid exchange rate
  vi.mocked(canMakeCall).mockReturnValue(true);
  vi.mocked(getBudgetStatus).mockReturnValue(makeBudgetStatus());
  vi.mocked(isDuplicate).mockResolvedValue(false);
  vi.mocked(getValidRate).mockResolvedValue(EXCHANGE_RATE);

  // Defaults: liquidity and notifications
  vi.mocked(calculateLiquidity).mockReturnValue({
    composite: 0.7,
    grade: 'B' as any,
    signals: {} as any,
  });
  vi.mocked(getVelocity).mockResolvedValue({
    sales7d: 0, sales30d: 0, medianPrice: null, avgDaysBetweenSales: null, fetched: false,
  });
  vi.mocked(adjustTierForLiquidity).mockImplementation((tier: any) => tier);
  vi.mocked(sendDealAlert).mockResolvedValue(undefined as any);
});

// ── Tests ────────────────────────────────────────────────────────────────

describe('Scanner Pipeline Integration', () => {
  it('happy path: processes listing through full pipeline and creates a deal', async () => {
    const listing = makeListing();
    const match = makeMatchResult();
    const enriched = makeEnrichedItem(listing);

    vi.mocked(searchItems).mockResolvedValue(makeSearchResponse([listing]));
    vi.mocked(matchListing).mockResolvedValue(match);
    vi.mocked(getItem).mockResolvedValue(enriched);
    vi.mocked(createDeal).mockResolvedValue({
      dealId: 'deal-abc-123',
      eventId: 1,
      ebayItemId: listing.itemId,
      tier: 'GRAIL',
      profitGBP: 21.0,
      profitPercent: 119.0,
      createdAt: new Date(),
    });

    const stats = await runScanCycle();

    expect(stats.listingsProcessed).toBe(1);
    expect(stats.dealsCreated).toBe(1);
    expect(stats.enrichmentCalls).toBe(1);
    expect(stats.errors).toBe(0);

    // Verify createDeal was called with correct structure
    expect(createDeal).toHaveBeenCalledTimes(1);
    const dealInput = vi.mocked(createDeal).mock.calls[0]![0]!;
    expect(dealInput.ebayItemId).toBe('v1|123456789|0');
    expect(dealInput.ebayPriceGBP).toBe(15);
    expect(dealInput.ebayShippingGBP).toBe(1.5);
    expect(dealInput.cardId).toBe('card-xyz-123');
    expect(dealInput.variantId).toBe(42);
    expect(dealInput.exchangeRate).toBe(EXCHANGE_RATE);
    expect(dealInput.tier).toBeDefined();
    expect(dealInput.confidence).toBe(0.88);
    expect(dealInput.confidenceTier).toBe('high');
    expect(dealInput.profitGBP).toBeGreaterThan(0);
    expect(dealInput.profitPercent).toBeGreaterThan(5);
    expect(dealInput.conditionComps).toBeDefined();
    expect(dealInput.matchSignals).toBeDefined();
  });

  it('rejects junk listings (lot/bundle) via real extraction pipeline', async () => {
    const junkListing = makeListing({
      itemId: 'v1|999999|0',
      title: 'Pokemon Card Lot Bundle 50 Cards Mixed Set',
    });

    vi.mocked(searchItems).mockResolvedValue(makeSearchResponse([junkListing]));

    const stats = await runScanCycle();

    expect(stats.listingsProcessed).toBe(1);
    expect(stats.skippedJunk).toBe(1);
    expect(stats.dealsCreated).toBe(0);
    expect(matchListing).not.toHaveBeenCalled();
  });

  it('skips listing when matchListing returns null', async () => {
    const listing = makeListing();

    vi.mocked(searchItems).mockResolvedValue(makeSearchResponse([listing]));
    vi.mocked(matchListing).mockResolvedValue(null);

    const stats = await runScanCycle();

    expect(stats.listingsProcessed).toBe(1);
    expect(stats.skippedNoMatch).toBe(1);
    expect(stats.dealsCreated).toBe(0);
    expect(getItem).not.toHaveBeenCalled();
  });

  it('skips duplicate listings', async () => {
    const listing = makeListing();

    vi.mocked(searchItems).mockResolvedValue(makeSearchResponse([listing]));
    vi.mocked(isDuplicate).mockResolvedValue(true);

    const stats = await runScanCycle();

    expect(stats.listingsProcessed).toBe(1);
    expect(stats.skippedDuplicate).toBe(1);
    expect(stats.dealsCreated).toBe(0);
    expect(matchListing).not.toHaveBeenCalled();
  });

  it('returns early when budget is exhausted', async () => {
    vi.mocked(canMakeCall).mockReturnValue(false);

    const stats = await runScanCycle();

    expect(stats.listingsProcessed).toBe(0);
    expect(stats.dealsCreated).toBe(0);
    expect(searchItems).not.toHaveBeenCalled();
  });

  it('breaks cycle when exchange rate is unavailable', async () => {
    const listing = makeListing();
    const match = makeMatchResult();

    vi.mocked(searchItems).mockResolvedValue(makeSearchResponse([listing]));
    vi.mocked(matchListing).mockResolvedValue(match);
    vi.mocked(getValidRate).mockRejectedValue(new Error('Exchange rate stale'));

    const stats = await runScanCycle();

    expect(stats.listingsProcessed).toBe(1);
    expect(stats.errors).toBe(1);
    expect(stats.dealsCreated).toBe(0);
    expect(getItem).not.toHaveBeenCalled();
  });

  it('rejects deal when enriched confidence < 0.65', async () => {
    const listing = makeListing();
    const lowConfidenceMatch = makeMatchResult({
      confidence: {
        composite: 0.55,
        name: 0.60,
        number: 1.0,
        denominator: 1.0,
        expansion: 0.30,
        variant: 0.50,
        normalization: 0.50,
      },
    });
    const enriched = makeEnrichedItem(listing);

    vi.mocked(searchItems).mockResolvedValue(makeSearchResponse([listing]));
    // Phase 1 match with sufficient confidence to pass enrichment gate
    vi.mocked(matchListing)
      .mockResolvedValueOnce(makeMatchResult()) // Phase 1: good confidence
      .mockResolvedValueOnce(lowConfidenceMatch); // Phase 2: low confidence
    vi.mocked(getItem).mockResolvedValue(enriched);

    const stats = await runScanCycle();

    expect(stats.enrichmentCalls).toBe(1);
    expect(stats.dealsCreated).toBe(0);
    expect(createDeal).not.toHaveBeenCalled();
  });

  it('skips enrichment when profit too low for gate', async () => {
    const listing = makeListing({
      price: { value: '35.00', currency: 'GBP' }, // Higher price = lower profit margin
    });
    // Low market value variant → low profit
    const lowProfitMatch = makeMatchResult({
      variant: {
        id: 42,
        name: 'holofoil',
        prices: { NM: { low: 35, market: 40 } }, // market=40 USD, GBP=31.60 < total cost
        gradedPrices: null,
      },
    });

    vi.mocked(searchItems).mockResolvedValue(makeSearchResponse([listing]));
    vi.mocked(matchListing).mockResolvedValue(lowProfitMatch);

    const stats = await runScanCycle();

    expect(stats.listingsProcessed).toBe(1);
    // Either skippedGate or skippedNoMatch (if calculateProfit returns null or profit < threshold)
    expect(stats.dealsCreated).toBe(0);
    expect(getItem).not.toHaveBeenCalled();
  });

  it('handles eBay search failure gracefully', async () => {
    vi.mocked(searchItems).mockRejectedValue(new Error('eBay 503'));

    const stats = await runScanCycle();

    expect(stats.errors).toBe(1);
    expect(stats.listingsProcessed).toBe(0);
    expect(stats.dealsCreated).toBe(0);
  });

  it('handles empty search results', async () => {
    vi.mocked(searchItems).mockResolvedValue(makeSearchResponse([]));

    const stats = await runScanCycle();

    expect(stats.listingsProcessed).toBe(0);
    expect(stats.dealsCreated).toBe(0);
    expect(stats.errors).toBe(0);
  });

  it('processes multiple listings in a single cycle', async () => {
    const listing1 = makeListing({ itemId: 'v1|111|0' });
    const listing2 = makeListing({
      itemId: 'v1|222|0',
      title: 'Pikachu VMAX 044/185 Vivid Voltage Holo NM',
    });
    const listing3 = makeListing({
      itemId: 'v1|333|0',
      title: 'Pokemon Card Lot 100 Cards Mixed Bulk', // junk
    });

    const match = makeMatchResult();
    const enriched1 = makeEnrichedItem(listing1);
    const enriched2 = makeEnrichedItem(listing2);

    vi.mocked(searchItems).mockResolvedValue(
      makeSearchResponse([listing1, listing2, listing3]),
    );
    vi.mocked(matchListing).mockResolvedValue(match);
    vi.mocked(getItem)
      .mockResolvedValueOnce(enriched1)
      .mockResolvedValueOnce(enriched2);
    vi.mocked(createDeal).mockResolvedValue({
      dealId: 'deal-1',
      eventId: 1,
      ebayItemId: 'v1|111|0',
      tier: 'GRAIL',
      profitGBP: 20,
      profitPercent: 100,
      createdAt: new Date(),
    });

    const stats = await runScanCycle();

    expect(stats.listingsProcessed).toBe(3);
    expect(stats.skippedJunk).toBe(1); // listing3
    // listing1 and listing2 go through the pipeline
    expect(stats.enrichmentCalls).toBe(2);
    expect(stats.dealsCreated).toBe(2);
  });

  it('stops enrichment when budget runs out mid-cycle', async () => {
    const listing1 = makeListing({ itemId: 'v1|111|0' });
    const listing2 = makeListing({ itemId: 'v1|222|0' });

    const match = makeMatchResult();

    vi.mocked(searchItems).mockResolvedValue(
      makeSearchResponse([listing1, listing2]),
    );
    vi.mocked(matchListing).mockResolvedValue(match);

    // Budget runs out after first listing's enrichment check
    let callCount = 0;
    vi.mocked(canMakeCall).mockImplementation(() => {
      callCount++;
      // First call: search OK. Second: first enrichment OK. Third: budget exhausted.
      return callCount <= 2;
    });

    vi.mocked(getItem).mockResolvedValue(null); // getItem returns null when budget exhausted

    const stats = await runScanCycle();

    expect(stats.listingsProcessed).toBeGreaterThanOrEqual(1);
    // Pipeline should stop enriching when budget is gone
    expect(stats.dealsCreated).toBe(0);
  });

  it('handles duplicate deal race condition (23505) from createDeal', async () => {
    const listing = makeListing();
    const match = makeMatchResult();
    const enriched = makeEnrichedItem(listing);

    vi.mocked(searchItems).mockResolvedValue(makeSearchResponse([listing]));
    vi.mocked(matchListing).mockResolvedValue(match);
    vi.mocked(getItem).mockResolvedValue(enriched);
    vi.mocked(createDeal).mockResolvedValue(null); // null = duplicate caught

    const stats = await runScanCycle();

    expect(stats.enrichmentCalls).toBe(1);
    expect(stats.dealsCreated).toBe(0); // null return = no deal created
    expect(stats.errors).toBe(0); // not counted as error
  });

  it('uses real extraction: title with card number flows to matchListing', async () => {
    const listing = makeListing({
      title: 'Pikachu 025/165 Scarlet & Violet 151 Reverse Holo LP',
    });

    vi.mocked(searchItems).mockResolvedValue(makeSearchResponse([listing]));
    vi.mocked(matchListing).mockResolvedValue(null); // no match, we just want to verify extraction

    const stats = await runScanCycle();

    // matchListing was called — extraction succeeded, passed junk gate
    expect(matchListing).toHaveBeenCalledTimes(1);
    const signals = vi.mocked(matchListing).mock.calls[0]![0]!;

    // Verify real extraction produced correct signals
    expect(signals.cardNumber).toBeDefined();
    expect(signals.cardNumber!.number).toBe(25);
    expect(signals.cardNumber!.denominator).toBe(165);
    expect(stats.skippedJunk).toBe(0);
  });

  it('tier classification: GRAIL for high profit + high confidence', async () => {
    const listing = makeListing({
      price: { value: '10.00', currency: 'GBP' }, // Cheap listing
    });
    // Very high market value → huge profit
    const match = makeMatchResult({
      variant: {
        id: 42,
        name: 'holofoil',
        prices: { NM: { low: 80, market: 100 } }, // 100 USD * 0.79 = 79 GBP >> 10+1.5+fee
        gradedPrices: null,
      },
      confidence: {
        composite: 0.92,
        name: 1.0,
        number: 1.0,
        denominator: 1.0,
        expansion: 0.90,
        variant: 0.95,
        normalization: 1.0,
      },
    });
    const enriched = makeEnrichedItem(listing);

    vi.mocked(searchItems).mockResolvedValue(makeSearchResponse([listing]));
    vi.mocked(matchListing).mockResolvedValue(match);
    vi.mocked(getItem).mockResolvedValue(enriched);
    vi.mocked(createDeal).mockResolvedValue({
      dealId: 'deal-grail',
      eventId: 1,
      ebayItemId: listing.itemId,
      tier: 'GRAIL',
      profitGBP: 65,
      profitPercent: 500,
      createdAt: new Date(),
    });

    await runScanCycle();

    expect(createDeal).toHaveBeenCalledTimes(1);
    const dealInput = vi.mocked(createDeal).mock.calls[0]![0]!;
    expect(dealInput.tier).toBe('GRAIL');
    expect(dealInput.profitPercent).toBeGreaterThan(40);
    expect(dealInput.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it('conditionComps includes all available conditions converted to GBP', async () => {
    const listing = makeListing();
    const match = makeMatchResult({
      variant: {
        id: 42,
        name: 'holofoil',
        prices: {
          NM: { low: 40, market: 50 },
          LP: { low: 30, market: 38 },
          MP: { low: 20, market: 25 },
        },
        gradedPrices: null,
      },
    });
    const enriched = makeEnrichedItem(listing);

    vi.mocked(searchItems).mockResolvedValue(makeSearchResponse([listing]));
    vi.mocked(matchListing).mockResolvedValue(match);
    vi.mocked(getItem).mockResolvedValue(enriched);
    vi.mocked(createDeal).mockResolvedValue({
      dealId: 'deal-comps',
      eventId: 1,
      ebayItemId: listing.itemId,
      tier: 'HIT',
      profitGBP: 20,
      profitPercent: 100,
      createdAt: new Date(),
    });

    await runScanCycle();

    const dealInput = vi.mocked(createDeal).mock.calls[0]![0]!;
    const comps = dealInput.conditionComps!;

    expect(comps['NM']).toBeDefined();
    expect(comps['LP']).toBeDefined();
    expect(comps['MP']).toBeDefined();

    // Verify GBP conversion
    const nmComps = comps['NM'] as { marketUSD: number; marketGBP: number };
    expect(nmComps.marketUSD).toBe(50);
    expect(nmComps.marketGBP).toBeCloseTo(50 * EXCHANGE_RATE, 2);
  });
});
