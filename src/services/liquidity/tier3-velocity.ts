import pino from 'pino';
import { pool } from '../../db/pool.js';
import { scrydexGet } from '../scrydex/client.js';

// Re-export pure types and scoring function from velocity-scorer
// to keep the public API unchanged while avoiding I/O deps in tests
export { scoreVelocity } from './velocity-scorer.js';
export type { VelocityData } from './velocity-scorer.js';

import type { VelocityData } from './velocity-scorer.js';

const log = pino({ name: 'tier3-velocity' });

/**
 * Get sales velocity for a card+variant.
 * Checks cache first (7-day TTL), then fetches from Scrydex if needed.
 *
 * @param cardId - Scrydex card ID (e.g. "zsv10pt5-105")
 * @param variantName - Variant name (e.g. "holofoil")
 * @param forceFetch - If true, bypass cache and fetch fresh data
 * @returns VelocityData with sales counts and pricing
 */
export async function getVelocity(
  cardId: string,
  variantName: string,
  forceFetch = false
): Promise<VelocityData> {
  // Check cache first (7-day TTL)
  if (!forceFetch) {
    const cached = await getCachedVelocity(cardId, variantName);
    if (cached) return cached;
  }

  // Fetch from Scrydex listings endpoint
  try {
    const response = await scrydexGet(
      `/pokemon/v1/cards/${cardId}/listings`,
      { days: 30, source: 'ebay', variant: variantName }
    );

    // Parse response — expect an array of listing objects
    const listings = Array.isArray(response) ? response : (response?.data || []);

    // Calculate metrics
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const sales30d = listings.length;
    const sales7d = listings.filter((l: any) => {
      const soldDate = new Date(l.sold_at?.replace(/\//g, '-'));
      return soldDate >= sevenDaysAgo;
    }).length;

    // Median price
    const prices = listings
      .map((l: any) => l.price)
      .filter((p: any) => typeof p === 'number' && p > 0)
      .sort((a: number, b: number) => a - b);
    const medianPrice = prices.length > 0
      ? prices[Math.floor(prices.length / 2)]
      : null;

    // Average days between sales
    let avgDaysBetweenSales: number | null = null;
    if (listings.length >= 2) {
      const dates = listings
        .map((l: any) => new Date(l.sold_at?.replace(/\//g, '-')).getTime())
        .filter((d: number) => !isNaN(d))
        .sort((a: number, b: number) => a - b);

      if (dates.length >= 2) {
        const totalDays = (dates[dates.length - 1] - dates[0]) / (1000 * 60 * 60 * 24);
        avgDaysBetweenSales = Math.round((totalDays / (dates.length - 1)) * 100) / 100;
      }
    }

    // Cache the result
    await cacheVelocity(cardId, variantName, {
      sales7d,
      sales30d,
      medianPrice,
      avgDaysBetweenSales,
      rawListings: listings,
    });

    log.info(
      { cardId, variantName, sales7d, sales30d, medianPrice },
      'Fetched velocity from Scrydex'
    );

    return { sales7d, sales30d, medianPrice, avgDaysBetweenSales, fetched: true };
  } catch (err) {
    log.warn({ err, cardId, variantName }, 'Failed to fetch velocity from Scrydex');
    return { sales7d: 0, sales30d: 0, medianPrice: null, avgDaysBetweenSales: null, fetched: false };
  }
}

// --- Cache helpers ---

async function getCachedVelocity(
  cardId: string,
  variantName: string
): Promise<VelocityData | null> {
  const { rows } = await pool.query(
    `SELECT sales_7d, sales_30d, median_price, avg_days_between_sales
     FROM sales_velocity_cache
     WHERE card_id = $1 AND variant_name = $2
       AND fetched_at > NOW() - INTERVAL '7 days'`,
    [cardId, variantName]
  );

  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    sales7d: row.sales_7d,
    sales30d: row.sales_30d,
    medianPrice: row.median_price ? parseFloat(row.median_price) : null,
    avgDaysBetweenSales: row.avg_days_between_sales ? parseFloat(row.avg_days_between_sales) : null,
    fetched: true,
  };
}

async function cacheVelocity(
  cardId: string,
  variantName: string,
  data: {
    sales7d: number;
    sales30d: number;
    medianPrice: number | null;
    avgDaysBetweenSales: number | null;
    rawListings: any[];
  }
): Promise<void> {
  await pool.query(
    `INSERT INTO sales_velocity_cache (card_id, variant_name, sales_7d, sales_30d, median_price, avg_days_between_sales, raw_listings)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (card_id, variant_name) DO UPDATE SET
       sales_7d = $3, sales_30d = $4, median_price = $5,
       avg_days_between_sales = $6, raw_listings = $7,
       fetched_at = NOW()`,
    [
      cardId, variantName,
      data.sales7d, data.sales30d, data.medianPrice, data.avgDaysBetweenSales,
      JSON.stringify(data.rawListings),
    ]
  );
}
