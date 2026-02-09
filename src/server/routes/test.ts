import { Router } from "express";
import axios from "axios";
import { requireAuth } from "../services/auth.js";
import { searchItems } from "../services/ebayClient.js";
import { fetchExpansions, fetchCardsPage } from "../services/scrydexClient.js";
import { pool } from "../db/pool.js";
import { getUsdToGbpRate } from "../services/exchangeRate.js";
import { config } from "../config.js";

const router = Router();

const mask = (s: string) => s.length <= 8 ? "***" : `${s.slice(0, 4)}...${s.slice(-4)}`;

// Test eBay API: authenticates + searches for 3 pokemon card listings
router.get("/ebay", requireAuth, async (_req, res, next) => {
  const clientId = config.EBAY_CLIENT_ID;
  const clientSecret = config.EBAY_CLIENT_SECRET;
  const isSandbox = clientSecret.trim().startsWith("SBX-");
  const ebayBase = isSandbox ? "https://api.sandbox.ebay.com" : "https://api.ebay.com";
  const diagnostics = {
    client_id_length: clientId.length,
    client_id_preview: mask(clientId),
    client_secret_length: clientSecret.length,
    client_secret_preview: mask(clientSecret),
    has_whitespace: clientId !== clientId.trim() || clientSecret !== clientSecret.trim(),
    environment: isSandbox ? "sandbox" : "production",
    auth_url: `${ebayBase}/identity/v1/oauth2/token`
  };

  try {
    const start = Date.now();
    const results = await searchItems("pokemon card", 3);
    const elapsed = Date.now() - start;
    res.json({
      ok: true,
      provider: "ebay",
      elapsed_ms: elapsed,
      diagnostics,
      results_count: results.length,
      sample: results.map(r => ({
        title: r.title,
        price: r.price,
        condition: r.condition,
        image: r.image
      }))
    });
  } catch (error: any) {
    // Try a direct auth call with trimmed credentials for comparison
    let directAuthResult: any = null;
    try {
      const trimmedId = clientId.trim();
      const trimmedSecret = clientSecret.trim();
      const creds = Buffer.from(`${trimmedId}:${trimmedSecret}`).toString("base64");
      const { data } = await axios.post(
        `${ebayBase}/identity/v1/oauth2/token`,
        new URLSearchParams({
          grant_type: "client_credentials",
          scope: "https://api.ebay.com/oauth/api_scope"
        }),
        { headers: { Authorization: `Basic ${creds}`, "Content-Type": "application/x-www-form-urlencoded" }, timeout: 15000 }
      );
      directAuthResult = { ok: true, token_type: data.token_type, expires_in: data.expires_in };
    } catch (retryErr: any) {
      directAuthResult = { ok: false, error: retryErr.response?.data ?? retryErr.message };
    }

    res.status(502).json({
      ok: false,
      provider: "ebay",
      diagnostics,
      error: error.response?.data ?? error.message,
      direct_auth_with_trimmed_creds: directAuthResult
    });
  }
});

// Test Scrydex API: fetches expansions + first page of cards via client
router.get("/scrydex", requireAuth, async (_req, res, next) => {
  try {
    const start = Date.now();
    const expansions = await fetchExpansions();
    const cardsPage = await fetchCardsPage(1);
    const elapsed = Date.now() - start;
    res.json({
      ok: true,
      provider: "scrydex",
      elapsed_ms: elapsed,
      expansions_count: expansions.length,
      cards_page1_count: cardsPage.cards?.length ?? 0,
      has_more_cards: cardsPage.hasMore ?? false,
      sample_expansions: expansions.slice(0, 3).map((e: any) => ({ name: e.name, code: e.code, series: e.series })),
      sample_cards: (cardsPage.cards ?? []).slice(0, 3).map((c: any) => ({ id: c.id, name: c.name, number: c.number, prices: c.prices }))
    });
  } catch (error: any) {
    res.status(502).json({
      ok: false,
      provider: "scrydex",
      status: error.response?.status,
      error: error.response?.data ?? error.message
    });
  }
});

// Test exchange rate API
router.get("/exchange", requireAuth, async (_req, res, next) => {
  try {
    const start = Date.now();
    const rate = await getUsdToGbpRate();
    const elapsed = Date.now() - start;
    res.json({ ok: true, provider: "exchangerate", elapsed_ms: elapsed, usd_to_gbp: rate });
  } catch (error: any) {
    res.status(502).json({ ok: false, provider: "exchangerate", error: error.message });
  }
});

// Database health check
router.get("/db", requireAuth, async (_req, res, next) => {
  try {
    const start = Date.now();
    const tables = await pool.query(
      `SELECT relname as table, n_live_tup as row_count
       FROM pg_stat_user_tables ORDER BY relname`
    );
    const elapsed = Date.now() - start;
    res.json({ ok: true, elapsed_ms: elapsed, tables: tables.rows });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Run all tests
router.get("/", requireAuth, async (_req, res) => {
  const results: Record<string, any> = {};
  for (const provider of ["db", "exchange", "scrydex", "ebay"]) {
    try {
      const start = Date.now();
      switch (provider) {
        case "db": {
          await pool.query("SELECT 1");
          results[provider] = { ok: true, elapsed_ms: Date.now() - start };
          break;
        }
        case "exchange": {
          const rate = await getUsdToGbpRate();
          results[provider] = { ok: true, elapsed_ms: Date.now() - start, usd_to_gbp: rate };
          break;
        }
        case "scrydex": {
          const exps = await fetchExpansions();
          results[provider] = { ok: true, elapsed_ms: Date.now() - start, expansions: exps.length };
          break;
        }
        case "ebay": {
          const items = await searchItems("pokemon card", 1);
          results[provider] = { ok: true, elapsed_ms: Date.now() - start, items: items.length };
          break;
        }
      }
    } catch (error: any) {
      results[provider] = { ok: false, error: error.response?.data ?? error.message };
    }
  }
  res.json(results);
});

export default router;
