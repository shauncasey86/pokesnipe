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
  prices: Record<string, { low?: number; market?: number }>;
  gradedPrices: Record<string, { low?: number; market?: number; mid?: number; high?: number }>;
  trends: Record<string, Record<string, { price_change?: number; percent_change?: number }>>;
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

// ── Paginated response wrapper ─────────────────────────────────────

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

// ── Fetch helpers ──────────────────────────────────────────────────

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
  return res.json() as Promise<T>;
}

function qs(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return '';
  return '?' + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString();
}

// ── API functions ──────────────────────────────────────────────────

export async function getExpansions(params?: {
  sort?: string;
  series?: string;
  page?: number;
  limit?: number;
}): Promise<PaginatedResponse<Expansion>> {
  return fetchJson(`/api/catalog/expansions${qs({
    sort: params?.sort,
    series: params?.series,
    page: params?.page,
    limit: params?.limit,
  })}`);
}

export async function getExpansionDetail(
  id: string,
  params?: { sort?: string; rarity?: string; page?: number; limit?: number },
): Promise<{ expansion: ExpansionDetail; cards: PaginatedResponse<CardSummary> }> {
  return fetchJson(`/api/catalog/expansions/${encodeURIComponent(id)}${qs({
    sort: params?.sort,
    rarity: params?.rarity,
    page: params?.page,
    limit: params?.limit,
  })}`);
}

export async function searchCards(
  query: string,
  params?: { page?: number; limit?: number },
): Promise<PaginatedResponse<CardSummary> & { query: string }> {
  return fetchJson(`/api/catalog/cards/search${qs({
    q: query,
    page: params?.page,
    limit: params?.limit,
  })}`);
}

export async function getCardDetail(
  id: string,
): Promise<{ card: CardDetail; expansion: { id: string; name: string; code: string; series: string; logo: string | null }; variants: Variant[] }> {
  return fetchJson(`/api/catalog/cards/${encodeURIComponent(id)}`);
}

export async function getTrending(params?: {
  period?: string;
  direction?: string;
  minPrice?: number;
  condition?: string;
  limit?: number;
}): Promise<{ data: TrendingCard[] }> {
  return fetchJson(`/api/catalog/trending${qs({
    period: params?.period,
    direction: params?.direction,
    minPrice: params?.minPrice,
    condition: params?.condition,
    limit: params?.limit,
  })}`);
}
