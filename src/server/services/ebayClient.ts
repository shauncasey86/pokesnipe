import axios from "axios";
import { config } from "../config.js";
import { TokenBucket } from "./rateLimiter.js";
import { trackApiCall } from "./apiUsageTracker.js";

// Auto-detect sandbox vs production based on credential prefix
const isSandbox = config.EBAY_CLIENT_SECRET.trim().startsWith("SBX-");
const ebayBase = isSandbox ? "https://api.sandbox.ebay.com" : "https://api.ebay.com";

const authClient = axios.create({
  baseURL: `${ebayBase}/identity/v1`,
  timeout: 15000
});

const apiClient = axios.create({
  baseURL: `${ebayBase}/buy/browse/v1`,
  timeout: 15000
});

const limiter = new TokenBucket(5, 1);
let cachedToken: { accessToken: string; expiresAt: number } | null = null;

const getAccessToken = async () => {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.accessToken;
  }
  const credentials = Buffer.from(`${config.EBAY_CLIENT_ID.trim()}:${config.EBAY_CLIENT_SECRET.trim()}`).toString("base64");
  const { data } = await authClient.post(
    "/oauth2/token",
    new URLSearchParams({
      grant_type: "client_credentials",
      scope: "https://api.ebay.com/oauth/api_scope"
    }),
    { headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" } }
  );
  cachedToken = { accessToken: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.accessToken;
};

export type EbayListing = {
  itemId: string;
  title: string;
  itemWebUrl: string;
  price: { value: string; currency: string };
  shipping: { value: string; currency: string } | null;
  condition: string | null;
  itemSpecifics: Record<string, string>;
  image: string | null;
};

export const getItem = async (itemId: string): Promise<EbayListing> => {
  await limiter.take();
  trackApiCall("ebay").catch(() => {});
  const token = await getAccessToken();
  // Use legacy_item_id endpoint since eBay URLs contain numeric legacy IDs
  const { data } = await apiClient.get("/item/get_item_by_legacy_id", {
    headers: { Authorization: `Bearer ${token}` },
    params: { legacy_item_id: itemId }
  });
  const specifics: Record<string, string> = {};
  for (const aspect of data.localizedAspects ?? []) {
    if (aspect.name && aspect.value) specifics[aspect.name] = aspect.value;
  }
  return {
    itemId: data.itemId,
    title: data.title,
    itemWebUrl: data.itemWebUrl,
    price: data.price,
    shipping: data.shippingOptions?.[0]?.shippingCost ?? null,
    condition: data.condition ?? null,
    itemSpecifics: specifics,
    image: data.image?.imageUrl ?? null
  };
};

export const searchItems = async (query: string, limit = 50): Promise<EbayListing[]> => {
  await limiter.take();
  trackApiCall("ebay").catch(() => {});
  const token = await getAccessToken();
  const { data } = await apiClient.get("/item_summary/search", {
    headers: { Authorization: `Bearer ${token}` },
    params: { q: query, limit }
  });
  return (data.itemSummaries ?? []).map((item: any) => ({
    itemId: item.itemId,
    title: item.title,
    itemWebUrl: item.itemWebUrl,
    price: item.price,
    shipping: item.shippingOptions?.[0]?.shippingCost ?? null,
    condition: item.condition ?? null,
    itemSpecifics: {},
    image: item.image?.imageUrl ?? null
  }));
};
