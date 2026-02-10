import axios from "axios";
import { config } from "../config.js";
import { TokenBucket } from "./rateLimiter.js";
import { trackApiCall } from "./apiUsageTracker.js";

const client = axios.create({
  baseURL: "https://api.scrydex.com/pokemon/v1",
  timeout: 30000,
  headers: {
    "X-Api-Key": config.SCRYDEX_API_KEY,
    "X-Team-ID": config.SCRYDEX_TEAM_ID
  }
});

const limiter = new TokenBucket(5, 1);

export type ScrydexExpansion = {
  id: string;
  name: string;
  code: string;
  series: string;
  releaseDate: string | null;
  printedTotal: number | null;
  logoUrl: string | null;
};

export type ScrydexCard = {
  id: string;
  name: string;
  number: string;
  printedTotal: number | null;
  rarity: string | null;
  supertype: string | null;
  subtypes: string[];
  images: { small?: string; large?: string };
  expansionId: string;
  prices: Record<string, number | null>;
};

const withRetry = async <T>(fn: () => Promise<T>, retries = 3): Promise<T> => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      if (attempt === retries) throw err;
      const delay = 2000 * attempt;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("unreachable");
};

const mapExpansion = (exp: any): ScrydexExpansion => ({
  id: exp.id,
  name: exp.name,
  code: exp.code,
  series: exp.series,
  releaseDate: exp.release_date ?? exp.releaseDate ?? null,
  printedTotal: exp.printed_total ?? exp.printedTotal ?? null,
  logoUrl: exp.logo ?? exp.logoUrl ?? null
});

export const fetchExpansions = async (): Promise<ScrydexExpansion[]> => {
  const all: ScrydexExpansion[] = [];
  let page = 1;
  while (true) {
    await limiter.take();
    const { data } = await withRetry(() =>
      client.get("/expansions", { params: { page, page_size: 100, language: "en" } })
    );
    trackApiCall("scrydex").catch(() => {});
    const items = data.data ?? data.expansions ?? [];
    all.push(...items.map(mapExpansion));
    const totalCount = data.total_count ?? items.length;
    const pageSize = data.page_size ?? 100;
    if (page * pageSize >= totalCount) break;
    page += 1;
  }
  return all;
};

export const fetchCardsPage = async (page: number) => {
  await limiter.take();
  const { data } = await withRetry(() =>
    client.get("/cards", {
      params: { page, page_size: 100, language: "en", include: "prices" }
    })
  );
  trackApiCall("scrydex").catch(() => {});
  const items = data.data ?? data.cards ?? [];
  const totalCount = data.total_count ?? 0;
  const pageSize = data.page_size ?? 100;
  return {
    cards: items,
    hasMore: page * pageSize < totalCount
  };
};
