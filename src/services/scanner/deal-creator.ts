import pino from 'pino';
import { pool } from '../../db/pool.js';

const log = pino({ name: 'deal-creator' });

export interface DealInput {
  // eBay listing data
  ebayItemId: string;
  ebayTitle: string;
  ebayPriceGBP: number;
  ebayShippingGBP: number;
  ebayImageUrl?: string;
  ebayUrl: string;
  sellerName?: string;
  sellerFeedback?: number;
  listedAt?: string;
  // Card match data
  cardId: string;
  variantId: number;
  // Pricing data
  buyerProtFee: number;
  totalCostGBP: number;
  marketPriceUSD: number;
  marketPriceGBP: number;
  exchangeRate: number;
  profitGBP: number;
  profitPercent: number;
  // Match metadata
  tier: string;
  confidence: number;
  confidenceTier: string;
  condition: string;
  conditionSource: string;
  isGraded: boolean;
  gradingCompany?: string;
  grade?: string;
  // Signals audit trail
  matchSignals: Record<string, unknown>;
  // Condition comps snapshot (all conditions, not just matched)
  conditionComps?: Record<string, unknown>;
}

export interface Deal {
  dealId: string;
  eventId: number;
  ebayItemId: string;
  tier: string;
  profitGBP: number;
  profitPercent: number;
  createdAt: Date;
}

/**
 * Insert a new deal into the deals table.
 * Returns the created deal with event_id (for SSE push in Stage 11).
 * Returns null if a duplicate is caught by the UNIQUE constraint.
 */
export async function createDeal(data: DealInput): Promise<Deal | null> {
  try {
    const { rows } = await pool.query(
      `INSERT INTO deals (
        ebay_item_id, ebay_title, card_id, variant_id,
        ebay_price_gbp, ebay_shipping_gbp, buyer_prot_fee, total_cost_gbp,
        market_price_usd, market_price_gbp, exchange_rate,
        profit_gbp, profit_percent, tier,
        confidence, confidence_tier, condition, condition_source,
        is_graded, grading_company, grade,
        match_signals, condition_comps,
        ebay_image_url, ebay_url, seller_name, seller_feedback, listed_at
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8,
        $9, $10, $11,
        $12, $13, $14,
        $15, $16, $17, $18,
        $19, $20, $21,
        $22, $23,
        $24, $25, $26, $27, $28
      ) RETURNING deal_id, event_id, ebay_item_id, tier, profit_gbp, profit_percent, created_at`,
      [
        data.ebayItemId, data.ebayTitle, data.cardId, data.variantId,
        data.ebayPriceGBP, data.ebayShippingGBP, data.buyerProtFee, data.totalCostGBP,
        data.marketPriceUSD, data.marketPriceGBP, data.exchangeRate,
        data.profitGBP, data.profitPercent, data.tier,
        data.confidence, data.confidenceTier, data.condition, data.conditionSource,
        data.isGraded, data.gradingCompany || null, data.grade || null,
        JSON.stringify(data.matchSignals), data.conditionComps ? JSON.stringify(data.conditionComps) : null,
        data.ebayImageUrl || null, data.ebayUrl, data.sellerName || null, data.sellerFeedback || null, data.listedAt || null,
      ],
    );

    const deal = rows[0];
    log.info(
      { dealId: deal.deal_id, eventId: deal.event_id, tier: deal.tier, profit: deal.profit_gbp },
      'Deal created',
    );

    return {
      dealId: deal.deal_id,
      eventId: deal.event_id,
      ebayItemId: deal.ebay_item_id,
      tier: deal.tier,
      profitGBP: parseFloat(deal.profit_gbp),
      profitPercent: parseFloat(deal.profit_percent),
      createdAt: deal.created_at,
    };
  } catch (err: unknown) {
    const pgErr = err as { code?: string };
    if (pgErr.code === '23505') {
      // Duplicate ebay_item_id — race condition, not a real error
      log.warn({ ebayItemId: data.ebayItemId }, 'Duplicate deal (race condition)');
      return null;
    }
    throw err; // re-throw other errors
  }
}
