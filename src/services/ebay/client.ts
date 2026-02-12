import pino from 'pino';
import { getAccessToken, clearTokenCache } from './auth.js';
import { scheduleEbayCall, checkRateLimitHeaders } from './rate-limiter.js';
import { canMakeCall, trackCall } from './budget.js';
import { sendAlert } from '../notifications/telegram.js';
import type { EbaySearchResponse, EbayItemDetail } from './types.js';

const logger = pino({ name: 'ebay-client' });

const BASE_URL = 'https://api.ebay.com/buy/browse/v1';
const MARKETPLACE_ID = 'EBAY_GB';

// Track consecutive 429s for alerting
let consecutive429s = 0;

export interface SearchOptions {
  minPrice?: number;
  categoryIds?: string;
  sort?: string;
}

async function ebayFetch<T>(url: string, retryOn401 = true): Promise<T> {
  const token = await getAccessToken();

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-EBAY-C-MARKETPLACE-ID': MARKETPLACE_ID,
      'Content-Type': 'application/json',
    },
  });

  checkRateLimitHeaders(res.headers);
  trackCall();

  if (res.status === 401 && retryOn401) {
    logger.warn('Got 401 from eBay — clearing token cache and retrying');
    clearTokenCache();
    return ebayFetch<T>(url, false);
  }

  if (res.status === 429) {
    consecutive429s++;
    const retryAfter = res.headers.get('Retry-After');
    const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 5000;
    logger.warn('Got 429 from eBay — backing off %dms (consecutive: %d)', waitMs, consecutive429s);
    if (consecutive429s >= 3) {
      sendAlert('warning', 'eBay Rate Limited', `${consecutive429s} consecutive 429 responses`).catch(() => {});
    }
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    return ebayFetch<T>(url, false);
  }

  // Reset consecutive 429 counter on success
  consecutive429s = 0;

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`eBay API error (${res.status}): ${body}`);
  }

  return (await res.json()) as T;
}

export async function searchItems(
  query: string,
  limit = 200,
  options: SearchOptions = {},
): Promise<EbaySearchResponse | null> {
  if (!canMakeCall()) {
    logger.warn('Budget exhausted — skipping searchItems');
    return null;
  }

  const minPrice = options.minPrice ?? 10;
  const categoryIds = options.categoryIds ?? '183454';
  const sort = options.sort ?? 'newlyListed';

  const filters = [
    `price:[${minPrice}..],priceCurrency:GBP`,
    'buyingOptions:{FIXED_PRICE}',
    'conditionIds:{2750|4000|1000|1500|2000|2500|3000}',
    'deliveryCountry:GB',
    'itemLocationCountry:GB',
  ].join(',');

  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
    category_ids: categoryIds,
    sort,
    filter: filters,
  });

  const url = `${BASE_URL}/item_summary/search?${params.toString()}`;
  logger.info({ query, limit }, 'Searching eBay');

  return scheduleEbayCall(() => ebayFetch<EbaySearchResponse>(url));
}

export async function getItem(itemId: string): Promise<EbayItemDetail | null> {
  if (!canMakeCall()) {
    logger.warn('Budget exhausted — skipping getItem(%s)', itemId);
    return null;
  }

  const url = `${BASE_URL}/item/${encodeURIComponent(itemId)}`;
  logger.info({ itemId }, 'Fetching eBay item detail');

  return scheduleEbayCall(() => ebayFetch<EbayItemDetail>(url));
}
