import axios from "axios";
import { config } from "../config.js";
import { TokenBucket } from "./rateLimiter.js";
import { trackApiCall } from "./apiUsageTracker.js";

const client = axios.create({
  baseURL: "https://api.scrydex.com/pokemon/v1",
  timeout: 15000,
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
  return data.expansions.map((exp: any) => ({
    id: exp.id,
    name: exp.name,
    code: exp.code,
    series: exp.series,
    releaseDate: exp.releaseDate ?? null,
    printedTotal: exp.printedTotal ?? null,
    logoUrl: exp.logoUrl ?? null
  }));
};

export const fetchCardsPage = async (page: number) => {
  await limiter.take();
  trackApiCall("scrydex").catch(() => {});
  const { data } = await client.get("/cards", {
    params: { page, pageSize: 100, language: "en", include: "prices" }
  });
  return data;
};

export const fetchAllCards = async (onPage?: (page: number, count: number) => void) => {
  const cards: ScrydexCard[] = [];
  let page = 1;
  while (true) {
    const data = await fetchCardsPage(page);
    const batch: ScrydexCard[] = data.cards.map((card: any) => ({
      id: card.id,
      name: card.name,
      number: card.number,
      printedTotal: card.expansion?.printedTotal ?? null,
      rarity: card.rarity ?? null,
      supertype: card.supertype ?? null,
      subtypes: card.subtypes ?? [],
      images: card.images ?? {},
      expansionId: card.expansion?.id,
      prices: card.prices ?? {}
    }));
    cards.push(...batch);
    onPage?.(page, batch.length);
    if (!data.hasMore) break;
    page += 1;
  }
  return cards;
};
