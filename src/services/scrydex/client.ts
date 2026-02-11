import Bottleneck from 'bottleneck';
import pino from 'pino';
import { config } from '../../config/index.js';

const logger = pino({ name: 'scrydex' });

// --- API response types ---

export interface ScrydexExpansion {
  id: string;
  name: string;
  series: string;
  code: string;
  total: number;
  printed_total: number;
  language: string;
  language_code: string;
  release_date: string;
  is_online_only: boolean;
  logo: string;
  symbol: string;
}

export interface ExpansionResponse {
  data: ScrydexExpansion[];
  page: number;
  pageSize?: number;
  page_size?: number;
  totalCount?: number;
  total_count?: number;
}

export interface ScrydexImage {
  type: string;
  small: string;
  medium: string;
  large: string;
}

export interface ScrydexTrends {
  days_1?: { price_change: number; percent_change: number };
  days_7?: { price_change: number; percent_change: number };
  days_14?: { price_change: number; percent_change: number };
  days_30?: { price_change: number; percent_change: number };
  days_90?: { price_change: number; percent_change: number };
  days_180?: { price_change: number; percent_change: number };
}

export interface ScrydexPrice {
  condition: string;
  type: string;
  is_perfect?: boolean;
  is_signed?: boolean;
  is_error?: boolean;
  low: number;
  market: number;
  mid?: number;
  high?: number;
  currency: string;
  grade?: string;
  company?: string;
  trends?: ScrydexTrends;
}

export interface ScrydexVariant {
  name: string;
  images: ScrydexImage[];
  prices: ScrydexPrice[];
}

export interface ScrydexCardExpansion {
  id: string;
  name: string;
  series: string;
  total: number;
  printed_total: number;
  release_date: string;
  code?: string;
}

export interface ScrydexCard {
  id: string;
  name: string;
  supertype: string;
  subtypes: string[];
  types?: string[];
  number: string;
  printed_number?: string;
  rarity: string;
  artist: string;
  language_code: string;
  images: ScrydexImage[];
  expansion: ScrydexCardExpansion;
  variants: ScrydexVariant[];
}

export interface CardResponse {
  data: ScrydexCard[];
  page: number;
  pageSize?: number;
  page_size?: number;
  totalCount?: number;
  total_count?: number;
}

export interface UsageResponse {
  total_credits: number;
  remaining_credits: number;
  used_credits: number;
  overage_credit_rate: number;
}

// --- Rate limiter ---

const limiter = new Bottleneck({
  maxConcurrent: 10,
  minTime: 13, // ~80 req/sec with 20% headroom
});

// --- HTTP helpers ---

const BASE_URL = 'https://api.scrydex.com/pokemon/v1/en';
const ACCOUNT_URL = 'https://api.scrydex.com/account/v1';

async function scrydexFetch<T>(url: string, retries = 3): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await fetch(url, {
      headers: {
        'X-Api-Key': config.SCRYDEX_API_KEY,
        'X-Team-ID': config.SCRYDEX_TEAM_ID,
      },
    });

    if (res.ok) {
      return (await res.json()) as T;
    }

    if (res.status === 429 || res.status >= 500) {
      if (attempt < retries) {
        const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
        logger.warn({ status: res.status, attempt, delay }, 'Retryable error, backing off');
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
    }

    const body = await res.text().catch(() => '');
    throw new Error(`Scrydex API error: ${res.status} ${res.statusText} - ${body}`);
  }

  // Unreachable, but satisfies TypeScript
  throw new Error('Scrydex API: max retries exhausted');
}

// --- Public client methods ---

const API_BASE = 'https://api.scrydex.com';

/**
 * Generic GET request to any Scrydex API endpoint.
 * Used by tier3-velocity for /pokemon/v1/cards/{id}/listings.
 *
 * @param path - API path (e.g. "/pokemon/v1/cards/zsv10pt5-105/listings")
 * @param params - Query parameters to append
 */
export async function scrydexGet<T = any>(
  path: string,
  params?: Record<string, string | number>,
): Promise<T> {
  const url = new URL(path, API_BASE);
  if (params) {
    for (const [key, val] of Object.entries(params)) {
      url.searchParams.set(key, String(val));
    }
  }
  return limiter.schedule(() => scrydexFetch<T>(url.toString()));
}

export async function getExpansions(page = 1): Promise<ExpansionResponse> {
  return limiter.schedule(() =>
    scrydexFetch<ExpansionResponse>(
      `${BASE_URL}/expansions?page_size=100&page=${page}`,
    ),
  );
}

export async function getExpansionCards(expansionId: string, page: number): Promise<CardResponse> {
  return limiter.schedule(() =>
    scrydexFetch<CardResponse>(
      `${BASE_URL}/expansions/${encodeURIComponent(expansionId)}/cards?include=prices&page_size=100&page=${page}`,
    ),
  );
}

export async function getAccountUsage(): Promise<UsageResponse> {
  // The account API may wrap in { data: ... } and may return camelCase keys.
  // Normalise both so the rest of the codebase can rely on snake_case.
  const raw: any = await limiter.schedule(() =>
    scrydexFetch<any>(`${ACCOUNT_URL}/usage`),
  );
  const d = raw.data ?? raw;
  return {
    total_credits: d.total_credits ?? d.totalCredits,
    remaining_credits: d.remaining_credits ?? d.remainingCredits,
    used_credits: d.used_credits ?? d.usedCredits,
    overage_credit_rate: d.overage_credit_rate ?? d.overageCreditRate,
  };
}
