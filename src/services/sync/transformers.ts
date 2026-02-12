import pino from 'pino';
import type {
  ScrydexExpansion,
  ScrydexCard,
  ScrydexVariant,
  ScrydexPrice,
  ScrydexAncientTrait,
  ScrydexAbility,
  ScrydexAttack,
  ScrydexWeaknessResistance,
} from '../scrydex/client.js';

const logger = pino({ name: 'transformers' });

// --- Row types for database inserts ---

export interface ExpansionRow {
  scrydex_id: string;
  name: string;
  code: string;
  series: string;
  printed_total: number;
  total: number;
  release_date: Date;
  language_code: string;
  logo_url: string | null;
  symbol_url: string | null;
}

export interface CardRow {
  scrydex_card_id: string;
  name: string;
  number: string;
  number_normalized: string;
  expansion_id: string;
  expansion_name: string;
  expansion_code: string;
  printed_total: number;
  rarity: string | null;
  rarity_code: string | null;
  supertype: string | null;
  subtypes: string[];
  types: string[];
  hp: string | null;
  level: string | null;
  evolves_from: string[];
  rules: string[];
  ancient_trait: ScrydexAncientTrait | null;
  abilities: ScrydexAbility[];
  attacks: ScrydexAttack[];
  weaknesses: ScrydexWeaknessResistance[];
  resistances: ScrydexWeaknessResistance[];
  retreat_cost: string[];
  converted_retreat_cost: number | null;
  printed_number: string | null;
  national_pokedex_numbers: number[];
  flavor_text: string | null;
  regulation_mark: string | null;
  expansion_sort_order: number | null;
  artist: string | null;
  image_small: string | null;
  image_medium: string | null;
  image_large: string | null;
  market_price_usd: number | null;
}

export interface VariantRow {
  card_id: string;
  name: string;
  image_small: string | null;
  image_medium: string | null;
  image_large: string | null;
  prices: Record<string, RawPriceEntry>;
  graded_prices: Record<string, GradedPriceEntry> | null;
  trends: Record<string, Record<string, { price_change: number; percent_change: number }>>;
}

// --- Helpers ---

/**
 * Normalize card number: strip leading zeros from pure numeric strings,
 * leave alphanumeric (e.g., "TG15") as-is.
 */
export function normalizeNumber(num: string): string {
  // If purely numeric (possibly with leading zeros), parse to remove leading zeros
  if (/^\d+$/.test(num)) {
    return String(parseInt(num, 10));
  }
  return num;
}

/**
 * Get the best NM raw market price across all variants.
 */
export function getBestNMPrice(variants: ScrydexVariant[]): number | null {
  let best: number | null = null;
  for (const variant of variants) {
    for (const price of variant.prices) {
      if (price.type === 'raw' && price.condition === 'NM' && price.market != null) {
        if (best === null || price.market > best) {
          best = price.market;
        }
      }
    }
  }
  return best;
}

const TREND_KEY_MAP: Record<string, string> = {
  days_1: '1d',
  days_7: '7d',
  days_14: '14d',
  days_30: '30d',
  days_90: '90d',
  days_180: '180d',
};

export interface RawPriceEntry {
  low: number;
  market: number;
  currency: string;
  is_perfect?: boolean;
  is_signed?: boolean;
  is_error?: boolean;
}

export function buildPricesJsonb(
  prices: ScrydexPrice[],
): Record<string, RawPriceEntry> {
  const result: Record<string, RawPriceEntry> = {};
  for (const p of prices) {
    if (p.type !== 'raw') continue;
    const entry: RawPriceEntry = { low: p.low, market: p.market, currency: p.currency };
    if (p.is_perfect) entry.is_perfect = true;
    if (p.is_signed) entry.is_signed = true;
    if (p.is_error) entry.is_error = true;
    result[p.condition] = entry;
  }
  return result;
}

export interface GradedPriceEntry {
  low: number;
  market: number;
  mid?: number;
  high?: number;
  currency: string;
  is_perfect?: boolean;
  is_signed?: boolean;
  is_error?: boolean;
}

export function buildGradedPricesJsonb(
  prices: ScrydexPrice[],
): Record<string, GradedPriceEntry> | null {
  const result: Record<string, GradedPriceEntry> = {};
  let count = 0;
  for (const p of prices) {
    if (p.type !== 'graded') continue;
    const key = `${p.company ?? 'UNKNOWN'}_${p.grade ?? '0'}`;
    const entry: GradedPriceEntry = {
      low: p.low,
      market: p.market,
      currency: p.currency,
    };
    if (p.mid != null) entry.mid = p.mid;
    if (p.high != null) entry.high = p.high;
    if (p.is_perfect) entry.is_perfect = true;
    if (p.is_signed) entry.is_signed = true;
    if (p.is_error) entry.is_error = true;
    result[key] = entry;
    count++;
  }
  return count > 0 ? result : null;
}

export function buildTrendsJsonb(
  prices: ScrydexPrice[],
): Record<string, Record<string, { price_change: number; percent_change: number }>> {
  const result: Record<string, Record<string, { price_change: number; percent_change: number }>> = {};
  for (const p of prices) {
    if (!p.trends) continue;
    // Build key: raw conditions use condition name (NM/LP/MP/HP), graded use COMPANY_GRADE
    const key = p.type === 'graded'
      ? `${p.company ?? 'UNKNOWN'}_${p.grade ?? '0'}`
      : p.condition;
    const conditionTrends: Record<string, { price_change: number; percent_change: number }> = {};
    for (const [apiKey, value] of Object.entries(p.trends)) {
      const mappedKey = TREND_KEY_MAP[apiKey];
      if (mappedKey && value) {
        conditionTrends[mappedKey] = {
          price_change: value.price_change,
          percent_change: value.percent_change,
        };
      }
    }
    if (Object.keys(conditionTrends).length > 0) {
      result[key] = conditionTrends;
    }
  }
  return result;
}

// --- Main transformers ---

export function transformExpansion(apiExpansion: ScrydexExpansion): ExpansionRow {
  // Convert "YYYY/MM/DD" to Date, fallback to epoch if missing
  let releaseDate: Date;
  if (apiExpansion.release_date && apiExpansion.release_date.includes('/')) {
    const dateParts = apiExpansion.release_date.split('/');
    releaseDate = new Date(`${dateParts[0]}-${dateParts[1]}-${dateParts[2]}`);
  } else if (apiExpansion.release_date) {
    releaseDate = new Date(apiExpansion.release_date);
  } else {
    releaseDate = new Date('1970-01-01');
  }

  if (isNaN(releaseDate.getTime())) {
    logger.warn({ id: apiExpansion.id, release_date: apiExpansion.release_date }, 'Invalid release_date, using epoch');
    releaseDate = new Date('1970-01-01');
  }

  return {
    scrydex_id: apiExpansion.id,
    name: apiExpansion.name || apiExpansion.id,
    code: apiExpansion.code || apiExpansion.id.toUpperCase(),
    series: apiExpansion.series || 'Unknown',
    printed_total: apiExpansion.printed_total ?? 0,
    total: apiExpansion.total ?? 0,
    release_date: releaseDate,
    language_code: apiExpansion.language_code || 'EN',
    logo_url: apiExpansion.logo || null,
    symbol_url: apiExpansion.symbol || null,
  };
}

export function transformCard(apiCard: ScrydexCard, expansionId: string): CardRow {
  if (!apiCard.variants || apiCard.variants.length === 0) {
    logger.warn({ cardId: apiCard.id }, 'Card has zero variants');
  }

  return {
    scrydex_card_id: apiCard.id,
    name: apiCard.name,
    number: apiCard.number,
    number_normalized: normalizeNumber(apiCard.number),
    expansion_id: expansionId,
    expansion_name: apiCard.expansion.name,
    expansion_code: apiCard.expansion.code || '',
    printed_total: apiCard.expansion.printed_total ?? 0,
    rarity: apiCard.rarity || null,
    rarity_code: apiCard.rarity_code || null,
    supertype: apiCard.supertype || null,
    subtypes: apiCard.subtypes || [],
    types: apiCard.types || [],
    hp: apiCard.hp || null,
    level: apiCard.level || null,
    evolves_from: apiCard.evolves_from || [],
    rules: apiCard.rules || [],
    ancient_trait: apiCard.ancient_trait || null,
    abilities: apiCard.abilities || [],
    attacks: apiCard.attacks || [],
    weaknesses: apiCard.weaknesses || [],
    resistances: apiCard.resistances || [],
    retreat_cost: apiCard.retreat_cost || [],
    converted_retreat_cost: apiCard.converted_retreat_cost ?? null,
    printed_number: apiCard.printed_number || null,
    national_pokedex_numbers: apiCard.national_pokedex_numbers || [],
    flavor_text: apiCard.flavor_text || null,
    regulation_mark: apiCard.regulation_mark || null,
    expansion_sort_order: apiCard.expansion_sort_order ?? null,
    artist: apiCard.artist || null,
    image_small: apiCard.images?.[0]?.small || null,
    image_medium: apiCard.images?.[0]?.medium || null,
    image_large: apiCard.images?.[0]?.large || null,
    market_price_usd: getBestNMPrice(apiCard.variants || []),
  };
}

export function transformVariant(apiVariant: ScrydexVariant, cardId: string): VariantRow {
  if (!apiVariant.prices || apiVariant.prices.length === 0) {
    logger.warn({ cardId, variant: apiVariant.name }, 'Variant has zero price entries');
  }

  return {
    card_id: cardId,
    name: apiVariant.name,
    image_small: apiVariant.images?.[0]?.small || null,
    image_medium: apiVariant.images?.[0]?.medium || null,
    image_large: apiVariant.images?.[0]?.large || null,
    prices: buildPricesJsonb(apiVariant.prices || []),
    graded_prices: buildGradedPricesJsonb(apiVariant.prices || []),
    trends: buildTrendsJsonb(apiVariant.prices || []),
  };
}
