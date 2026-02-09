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

export const fetchExpansions = async (): Promise<ScrydexExpansion[]> => {
  await limiter.take();
  trackApiCall("scrydex").catch(() => {});
  const { data } = await client.get("/expansions", { params: { language: "en" } });
  const items = data.data ?? data.expansions ?? [];
  return items.map((exp: any) => ({
    id: exp.id,
    name: exp.name,
    code: exp.code,
    series: exp.series,
    releaseDate: exp.release_date ?? exp.releaseDate ?? null,
    printedTotal: exp.printed_total ?? exp.printedTotal ?? null,
    logoUrl: exp.logo ?? exp.logoUrl ?? null
  }));
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

export const fetchCardsPage = async (page: number) => {
  await limiter.take();
  trackApiCall("scrydex").catch(() => {});
  const { data } = await withRetry(() =>
    client.get("/cards", {
      params: { page, page_size: 100, language: "en", include: "prices" }
    })
  );
  const items = data.data ?? data.cards ?? [];
  const totalCount = data.total_count ?? 0;
  const pageSize = data.page_size ?? 100;
  return {
    cards: items,
    hasMore: page * pageSize < totalCount
  };
};

export const fetchAllCards = async (onPage?: (page: number, count: number) => void) => {
  const cards: ScrydexCard[] = [];
  let page = 1;
  while (true) {
    const data = await fetchCardsPage(page);
    const batch: ScrydexCard[] = data.cards.map((card: any) => {
      // Card ID contains expansion prefix: "me2pt5-1" → expansion "me2pt5"
      const expansionId = card.expansion?.id ?? card.id?.split("-").slice(0, -1).join("-") ?? "";
      return {
        id: card.id,
        name: card.name,
        number: card.number ?? card.printed_number ?? null,
        printedTotal: card.printed_total ?? card.printedTotal ?? null,
        rarity: card.rarity ?? null,
        supertype: card.supertype ?? null,
        subtypes: card.subtypes ?? [],
        images: card.images ?? {},
        expansionId,
        prices: card.prices ?? {}
      };
    });
    cards.push(...batch);
    onPage?.(page, batch.length);
    if (!data.hasMore) break;
    page += 1;
  }
  return cards;
};
