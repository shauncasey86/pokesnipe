import { Router } from "express";
import axios from "axios";
import { requireAuth } from "../services/auth.js";
import { searchItems } from "../services/ebayClient.js";
import { fetchExpansions, fetchCardsPage } from "../services/scrydexClient.js";
import { pool } from "../db/pool.js";
import { getUsdToGbpRate } from "../services/exchangeRate.js";
import { config } from "../config.js";

const router = Router();

// Test eBay API: authenticates + searches for 3 pokemon card listings
router.get("/ebay", requireAuth, async (_req, res, next) => {
  try {
    const start = Date.now();
    const results = await searchItems("pokemon card", 3);
    const elapsed = Date.now() - start;
    res.json({
      ok: true,
      provider: "ebay",
      elapsed_ms: elapsed,
      results_count: results.length,
      sample: results.map(r => ({
        title: r.title,
        price: r.price,
        condition: r.condition,
        image: r.image
      }))
    });
  } catch (error: any) {
    res.status(502).json({
      ok: false,
      provider: "ebay",
      error: error.response?.data ?? error.message
    });
  }
});

// Test Scrydex API: raw response to debug structure
router.get("/scrydex", requireAuth, async (_req, res, next) => {
  try {
    const start = Date.now();
    // Raw request to see actual response structure
    const { data: rawExpansions } = await axios.get("https://api.scrydex.com/pokemon/v1/expansions", {
      params: { language: "en" },
      headers: { "X-Api-Key": config.SCRYDEX_API_KEY, "X-Team-ID": config.SCRYDEX_TEAM_ID },
      timeout: 15000
    });
    const { data: rawCards } = await axios.get("https://api.scrydex.com/pokemon/v1/cards", {
      params: { page: 1, pageSize: 3, language: "en", include: "prices" },
      headers: { "X-Api-Key": config.SCRYDEX_API_KEY, "X-Team-ID": config.SCRYDEX_TEAM_ID },
      timeout: 15000
    });
    const elapsed = Date.now() - start;
    res.json({
      ok: true,
      provider: "scrydex",
      elapsed_ms: elapsed,
      raw_expansions_keys: Object.keys(rawExpansions),
      raw_expansions_sample: typeof rawExpansions === "object" ? JSON.stringify(rawExpansions).slice(0, 500) : String(rawExpansions).slice(0, 500),
      raw_cards_keys: Object.keys(rawCards),
      raw_cards_sample: typeof rawCards === "object" ? JSON.stringify(rawCards).slice(0, 500) : String(rawCards).slice(0, 500)
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
