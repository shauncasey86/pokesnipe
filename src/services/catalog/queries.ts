import { pool } from '../../db/pool.js';

// ── Types ──────────────────────────────────────────────────────────

export interface Expansion {
  id: string;
  name: string;
  code: string;
  series: string;
  logo: string | null;
  symbol: string | null;
  cardCount: number;
  releaseDate: string;
}

export interface CardSummary {
  id: string;
  name: string;
  number: string;
  rarity: string | null;
  supertype: string | null;
  image: string | null;
  nmPrice: number | null;
}

export interface CardDetail {
  id: string;
  name: string;
  number: string;
  rarity: string | null;
  supertype: string | null;
  subtypes: string[];
  artist: string | null;
  image: string | null;
  imageLarge: string | null;
  marketPrice: number | null;
}

export interface Variant {
  name: string;
  image: string | null;
  prices: Record<string, unknown>;
  gradedPrices: Record<string, unknown>;
  trends: Record<string, unknown>;
}

export interface ExpansionDetail {
  id: string;
  name: string;
  code: string;
  series: string;
  logo: string | null;
  symbol: string | null;
  printedTotal: number;
  total: number;
  releaseDate: string;
}

export interface TrendingCard {
  card: {
    id: string;
    name: string;
    number: string;
    image: string | null;
    expansion: string;
    expansionCode: string;
  };
  variant: string;
  currentPrice: number | null;
  priceChange: number;
  percentChange: number;
  period: string;
}

// ── Queries ────────────────────────────────────────────────────────

const SORT_EXPANSIONS: Record<string, string> = {
  release_date: 'e.release_date DESC',
  '-release_date': 'e.release_date DESC',
  name: 'e.name ASC',
  '-name': 'e.name DESC',
  card_count: 'card_count DESC',
  '-card_count': 'card_count DESC',
};

export async function getExpansions(opts: {
  sort?: string;
  series?: string;
  page: number;
  limit: number;
  offset: number;
}): Promise<{ data: Expansion[]; total: number }> {
  const orderBy = SORT_EXPANSIONS[opts.sort || '-release_date'] || 'e.release_date DESC';
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (opts.series) {
    conditions.push(`e.series = $${idx++}`);
    params.push(opts.series);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM expansions e ${where}`,
    params,
  );

  const dataResult = await pool.query(
    `SELECT e.scrydex_id, e.name, e.code, e.series, e.logo_url, e.symbol_url, e.release_date,
            (SELECT COUNT(*)::int FROM cards WHERE expansion_id = e.scrydex_id) AS card_count
     FROM expansions e
     ${where}
     ORDER BY ${orderBy}
     LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, opts.limit, opts.offset],
  );

  return {
    data: dataResult.rows.map((r) => ({
      id: r.scrydex_id,
      name: r.name,
      code: r.code,
      series: r.series,
      logo: r.logo_url,
      symbol: r.symbol_url,
      cardCount: r.card_count,
      releaseDate: r.release_date,
    })),
    total: countResult.rows[0].total,
  };
}

export async function getExpansionDetail(
  id: string,
  opts: {
    sort?: string;
    rarity?: string;
    page: number;
    limit: number;
    offset: number;
  },
): Promise<{ expansion: ExpansionDetail | null; cards: { data: CardSummary[]; total: number } }> {
  const expResult = await pool.query(
    `SELECT scrydex_id, name, code, series, logo_url, symbol_url, printed_total, total, release_date
     FROM expansions WHERE scrydex_id = $1`,
    [id],
  );

  if (expResult.rows.length === 0) {
    return { expansion: null, cards: { data: [], total: 0 } };
  }

  const exp = expResult.rows[0];
  const expansion: ExpansionDetail = {
    id: exp.scrydex_id,
    name: exp.name,
    code: exp.code,
    series: exp.series,
    logo: exp.logo_url,
    symbol: exp.symbol_url,
    printedTotal: exp.printed_total,
    total: exp.total,
    releaseDate: exp.release_date,
  };

  // Card query with optional rarity filter
  const conditions: string[] = ['c.expansion_id = $1'];
  const params: unknown[] = [id];
  let idx = 2;

  if (opts.rarity) {
    conditions.push(`c.rarity = $${idx++}`);
    params.push(opts.rarity);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  let orderBy: string;
  switch (opts.sort) {
    case 'name':
      orderBy = 'c.name ASC';
      break;
    case 'price':
      orderBy = 'nm_price DESC NULLS LAST';
      break;
    default:
      orderBy = 'c.number_normalized ASC, c.number ASC';
  }

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM cards c ${where}`,
    params,
  );

  const cardResult = await pool.query(
    `SELECT c.scrydex_card_id, c.name, c.number, c.rarity, c.supertype, c.image_small,
            (SELECT (v.prices->'NM'->>'market')::numeric
             FROM variants v WHERE v.card_id = c.scrydex_card_id
             ORDER BY (v.prices->'NM'->>'market')::numeric DESC NULLS LAST LIMIT 1) AS nm_price
     FROM cards c
     ${where}
     ORDER BY ${orderBy}
     LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, opts.limit, opts.offset],
  );

  return {
    expansion,
    cards: {
      data: cardResult.rows.map((r) => ({
        id: r.scrydex_card_id,
        name: r.name,
        number: r.number,
        rarity: r.rarity,
        supertype: r.supertype,
        image: r.image_small,
        nmPrice: r.nm_price ? parseFloat(r.nm_price) : null,
      })),
      total: countResult.rows[0].total,
    },
  };
}

export async function searchCards(
  query: string,
  opts: { page: number; limit: number; offset: number },
): Promise<{ data: CardSummary[]; total: number; query: string }> {
  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM cards WHERE name % $1`,
    [query],
  );

  const dataResult = await pool.query(
    `SELECT c.scrydex_card_id, c.name, c.number, c.rarity, c.supertype, c.image_small,
            similarity(c.name, $1) AS sim,
            (SELECT (v.prices->'NM'->>'market')::numeric
             FROM variants v WHERE v.card_id = c.scrydex_card_id
             ORDER BY (v.prices->'NM'->>'market')::numeric DESC NULLS LAST LIMIT 1) AS nm_price
     FROM cards c
     WHERE c.name % $1
     ORDER BY sim DESC
     LIMIT $2 OFFSET $3`,
    [query, opts.limit, opts.offset],
  );

  return {
    data: dataResult.rows.map((r) => ({
      id: r.scrydex_card_id,
      name: r.name,
      number: r.number,
      rarity: r.rarity,
      supertype: r.supertype,
      image: r.image_small,
      nmPrice: r.nm_price ? parseFloat(r.nm_price) : null,
    })),
    total: countResult.rows[0].total,
    query,
  };
}

export async function getCardDetail(
  id: string,
): Promise<{
  card: CardDetail | null;
  expansion: { id: string; name: string; code: string; series: string; logo: string | null } | null;
  variants: Variant[];
}> {
  const cardResult = await pool.query(
    `SELECT scrydex_card_id, name, number, rarity, supertype, subtypes, artist,
            image_small, image_large, market_price_usd, expansion_id, expansion_name, expansion_code
     FROM cards WHERE scrydex_card_id = $1`,
    [id],
  );

  if (cardResult.rows.length === 0) {
    return { card: null, expansion: null, variants: [] };
  }

  const c = cardResult.rows[0];

  const expResult = await pool.query(
    `SELECT scrydex_id, name, code, series, logo_url FROM expansions WHERE scrydex_id = $1`,
    [c.expansion_id],
  );

  const variantResult = await pool.query(
    `SELECT name, image_small, prices, graded_prices, trends
     FROM variants WHERE card_id = $1
     ORDER BY name`,
    [id],
  );

  const exp = expResult.rows[0];

  return {
    card: {
      id: c.scrydex_card_id,
      name: c.name,
      number: c.number,
      rarity: c.rarity,
      supertype: c.supertype,
      subtypes: c.subtypes || [],
      artist: c.artist,
      image: c.image_small,
      imageLarge: c.image_large,
      marketPrice: c.market_price_usd ? parseFloat(c.market_price_usd) : null,
    },
    expansion: exp
      ? {
          id: exp.scrydex_id,
          name: exp.name,
          code: exp.code,
          series: exp.series,
          logo: exp.logo_url,
        }
      : null,
    variants: variantResult.rows.map((v) => ({
      name: v.name,
      image: v.image_small,
      prices: v.prices || {},
      gradedPrices: v.graded_prices || {},
      trends: v.trends || {},
    })),
  };
}

export async function getTrending(opts: {
  period?: string;
  direction?: string;
  minPrice?: number;
  condition?: string;
  limit: number;
}): Promise<{ data: TrendingCard[] }> {
  const period = opts.period || '7d';
  const condition = opts.condition || 'NM';
  const direction = opts.direction || 'both';
  const minPrice = opts.minPrice ?? 0;
  const limit = Math.min(opts.limit || 50, 100);

  // Params: $1=limit, $2=condition, $3=period, $4=minPrice
  let directionFilter = '';
  if (direction === 'up') {
    directionFilter = `AND (v.trends->$2->$3->>'percent_change')::numeric > 0`;
  } else if (direction === 'down') {
    directionFilter = `AND (v.trends->$2->$3->>'percent_change')::numeric < 0`;
  }

  const dataResult = await pool.query(
    `SELECT
       c.scrydex_card_id, c.name, c.number, c.image_small,
       c.expansion_name, c.expansion_code,
       v.name AS variant_name,
       (v.prices->$2->>'market')::numeric AS current_price,
       (v.trends->$2->$3->>'price_change')::numeric AS price_change,
       (v.trends->$2->$3->>'percent_change')::numeric AS percent_change
     FROM variants v
     JOIN cards c ON c.scrydex_card_id = v.card_id
     WHERE v.trends->$2->$3->>'percent_change' IS NOT NULL
       AND COALESCE((v.prices->$2->>'market')::numeric, 0) >= $4
       ${directionFilter}
     ORDER BY ABS((v.trends->$2->$3->>'percent_change')::numeric) DESC
     LIMIT $1`,
    [limit, condition, period, minPrice],
  );

  return {
    data: dataResult.rows.map((r) => ({
      card: {
        id: r.scrydex_card_id,
        name: r.name,
        number: r.number,
        image: r.image_small,
        expansion: r.expansion_name,
        expansionCode: r.expansion_code,
      },
      variant: r.variant_name,
      currentPrice: r.current_price ? parseFloat(r.current_price) : null,
      priceChange: r.price_change ? parseFloat(r.price_change) : 0,
      percentChange: r.percent_change ? parseFloat(r.percent_change) : 0,
      period,
    })),
  };
}
