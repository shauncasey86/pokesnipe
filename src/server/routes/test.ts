import { Router } from "express";
import axios from "axios";
import { requireAuth } from "../services/auth.js";
import { searchItems, getItem } from "../services/ebayClient.js";
import { fetchExpansions, fetchCardsPage } from "../services/scrydexClient.js";
import { matchListing } from "../services/matcher.js";
import { pool } from "../db/pool.js";
import { getUsdToGbpRate } from "../services/exchangeRate.js";
import { calculateProfit } from "../services/pricing.js";
import { getApiUsageToday } from "../services/apiUsageTracker.js";
import { config } from "../config.js";

const router = Router();

const mask = (s: string) => s.length <= 8 ? "***" : `${s.slice(0, 4)}...${s.slice(-4)}`;

// 1. Database connectivity + schema check
router.get("/db", requireAuth, async (_req, res) => {
  try {
    const start = Date.now();
    const conn = await pool.query("SELECT 1 as ok");
    const tables = await pool.query(
      `SELECT relname as "table", n_live_tup as row_count FROM pg_stat_user_tables ORDER BY relname`
    );
    const extensions = await pool.query(
      `SELECT extname, extversion FROM pg_extension WHERE extname IN ('pg_trgm','uuid-ossp') ORDER BY extname`
    );
    const sequences = await pool.query(
      `SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public'`
    );
    const migrations = await pool.query(
      `SELECT name, run_on FROM pgmigrations ORDER BY run_on`
    );
    const elapsed = Date.now() - start;
    res.json({
      ok: true,
      test: "database",
      elapsed_ms: elapsed,
      connection: "connected",
      tables: tables.rows,
      extensions: extensions.rows,
      sequences: sequences.rows.map(r => r.sequence_name),
      migrations: migrations.rows
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, test: "database", error: error.message });
  }
});

// 2. eBay API auth + search
router.get("/ebay", requireAuth, async (_req, res) => {
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
    const BULK_RE = /\b(lot|bundle|collection|choose\s*(your|a|the)?\s*card|pick\s*(your|a)?\s*card|select\s*(your|a)?\s*card|selection|random|mystery|grab bag|bulk|set of|x\d{2,}|\d{2,}\s*cards|\d{2,}\s*card\s*lot|wholesale|mixed|assorted|binder|starter kit|deck\s+(box|cards|list)|my first battle|all\s+cards\s+available|common|uncommon|job\s*lot)\b/i;
    const results = await searchItems("pokemon charizard ex", 6, "183454", "price:[5..],buyingOptions:{FIXED_PRICE}");
    const elapsed = Date.now() - start;
    const filtered = results.filter(r => !BULK_RE.test(r.title));
    res.json({
      ok: true,
      test: "ebay",
      elapsed_ms: elapsed,
      diagnostics,
      results_count: results.length,
      filtered_count: filtered.length,
      rejected_count: results.length - filtered.length,
      sample: filtered.slice(0, 3).map(r => ({ title: r.title, price: r.price, condition: r.condition, image: r.image })),
      rejected: results.filter(r => BULK_RE.test(r.title)).slice(0, 3).map(r => ({ title: r.title, reason: r.title.match(BULK_RE)?.[0] }))
    });
  } catch (error: any) {
    res.status(502).json({
      ok: false,
      test: "ebay",
      diagnostics,
      error: error.response?.data ?? error.message
    });
  }
});

// 3. eBay item lookup (tests getItem / legacy ID)
router.get("/ebay-lookup", requireAuth, async (req, res) => {
  const url = (req.query.url as string) || "";
  const itemMatch = url.match(/\/(\d{9,})/);
  const itemId = itemMatch?.[1] ?? "404542741479"; // fallback to a known test ID
  try {
    const start = Date.now();
    const item = await getItem(itemId);
    const elapsed = Date.now() - start;
    res.json({
      ok: true,
      test: "ebay-lookup",
      elapsed_ms: elapsed,
      item_id: itemId,
      title: item.title,
      price: item.price,
      condition: item.condition,
      specifics_count: Object.keys(item.itemSpecifics).length,
      specifics: item.itemSpecifics,
      image: item.image
    });
  } catch (error: any) {
    res.status(502).json({
      ok: false,
      test: "ebay-lookup",
      item_id: itemId,
      error: error.response?.data ?? error.message,
      status: error.response?.status
    });
  }
});

// 4. Scrydex API (expansions + cards)
router.get("/scrydex", requireAuth, async (_req, res) => {
  try {
    const start = Date.now();
    const cardsPage = await fetchCardsPage(1);
    const elapsed = Date.now() - start;
    const cards = cardsPage.cards ?? [];
    res.json({
      ok: true,
      test: "scrydex",
      elapsed_ms: elapsed,
      cards_page1_count: cards.length,
      has_more_cards: cardsPage.hasMore ?? false,
      sample_cards: cards.slice(0, 3).map((c: any) => ({
        id: c.id,
        name: c.name,
        number: c.number ?? c.printed_number,
        prices: c.prices,
        expansion: c.expansion?.id ?? c.id?.split("-").slice(0, -1).join("-")
      })),
      api_key_preview: mask(config.SCRYDEX_API_KEY),
      team_id: config.SCRYDEX_TEAM_ID
    });
  } catch (error: any) {
    res.status(502).json({
      ok: false,
      test: "scrydex",
      status: error.response?.status,
      error: error.response?.data ?? error.message,
      api_key_preview: mask(config.SCRYDEX_API_KEY),
      team_id: config.SCRYDEX_TEAM_ID
    });
  }
});

// 5. Exchange rate
router.get("/exchange", requireAuth, async (_req, res) => {
  try {
    const start = Date.now();
    const rate = await getUsdToGbpRate();
    const elapsed = Date.now() - start;
    res.json({ ok: true, test: "exchange", elapsed_ms: elapsed, usd_to_gbp: rate });
  } catch (error: any) {
    res.status(502).json({ ok: false, test: "exchange", error: error.message });
  }
});

// 6. Card matching test (simulates what the scanner does)
router.get("/match", requireAuth, async (req, res) => {
  const title = (req.query.title as string) || "Pokemon Card Charizard 4/102 Base Set Holo";
  try {
    const start = Date.now();
    const specifics: Record<string, string> = {};
    if (req.query.card_name) specifics["Card Name"] = req.query.card_name as string;
    if (req.query.set) specifics["Set"] = req.query.set as string;
    const match = await matchListing(title, specifics);
    const elapsed = Date.now() - start;
    if (!match) {
      res.json({
        ok: true,
        test: "match",
        elapsed_ms: elapsed,
        matched: false,
        title,
        specifics,
        message: "No card match found. This could mean the card isn't in the DB or the title doesn't contain enough signals."
      });
      return;
    }
    const card = await pool.query(
      `SELECT c.name, c.card_number, c.printed_total, c.market_price_usd, c.rarity,
              e.name as expansion_name, e.code
       FROM cards c JOIN expansions e ON c.expansion_id = e.id WHERE c.id = $1`,
      [match.cardId]
    );
    res.json({
      ok: true,
      test: "match",
      elapsed_ms: elapsed,
      matched: true,
      title,
      specifics,
      confidence: match.confidence,
      breakdown: match.confidenceBreakdown,
      extracted: match.extracted,
      card: card.rows[0] ?? null
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, test: "match", title, error: error.message });
  }
});

// 7. Full pipeline test (eBay search → match → price)
router.get("/pipeline", requireAuth, async (_req, res) => {
  const results: any[] = [];
  try {
    const start = Date.now();

    // Step 1: Search eBay
    const listings = await searchItems("pokemon charizard ex", 5, "183454", "price:[5..],buyingOptions:{FIXED_PRICE}");
    results.push({ step: "ebay_search", ok: true, count: listings.length, elapsed_ms: Date.now() - start });

    // Step 2: Get exchange rate
    const fx = await getUsdToGbpRate();
    results.push({ step: "exchange_rate", ok: true, usd_to_gbp: fx });

    // Step 3: Match each listing
    for (const listing of listings.slice(0, 3)) {
      const matchStart = Date.now();
      const match = await matchListing(listing.title, listing.itemSpecifics);
      if (!match) {
        results.push({
          step: "match",
          ok: true,
          matched: false,
          title: listing.title.slice(0, 80),
          elapsed_ms: Date.now() - matchStart
        });
        continue;
      }
      const card = await pool.query(
        `SELECT c.name, c.card_number, c.market_price_usd, e.name as expansion_name
         FROM cards c JOIN expansions e ON c.expansion_id = e.id WHERE c.id = $1`,
        [match.cardId]
      );
      const c = card.rows[0];
      if (!c?.market_price_usd) {
        results.push({
          step: "match",
          ok: true,
          matched: true,
          card: c?.name,
          no_market_price: true,
          elapsed_ms: Date.now() - matchStart
        });
        continue;
      }

      // Step 4: Calculate profit
      const priceVal = Number(listing.price.value);
      const currency = listing.price.currency ?? "GBP";
      const priceGbp = currency === "GBP" ? priceVal : priceVal * fx;
      const shippingGbp = listing.shipping ? (listing.shipping.currency === "GBP" ? Number(listing.shipping.value) : Number(listing.shipping.value) * fx) : 0;
      const marketGbp = Number(c.market_price_usd) * fx;
      const pricing = calculateProfit(priceGbp, shippingGbp, marketGbp);

      const tier = pricing.profitPct >= 40 ? "grail"
        : pricing.profitPct >= 25 ? "hit"
        : pricing.profitPct >= 15 ? "flip"
        : "sleeper";

      results.push({
        step: "pipeline",
        ok: true,
        title: listing.title.slice(0, 80),
        matched_card: c.name,
        expansion: c.expansion_name,
        confidence: Math.round(match.confidence * 100) + "%",
        ebay_price: `${currency} ${priceVal}`,
        market_usd: `$${c.market_price_usd}`,
        market_gbp: `£${marketGbp.toFixed(2)}`,
        profit: `£${pricing.profit.toFixed(2)}`,
        profit_pct: `${pricing.profitPct.toFixed(0)}%`,
        tier,
        elapsed_ms: Date.now() - matchStart
      });
    }

    const total = Date.now() - start;
    res.json({ ok: true, test: "pipeline", elapsed_ms: total, steps: results });
  } catch (error: any) {
    res.status(500).json({ ok: false, test: "pipeline", steps: results, error: error.message });
  }
});

// 8. API usage stats
router.get("/usage", requireAuth, async (_req, res) => {
  try {
    const [ebay, scrydex] = await Promise.all([
      getApiUsageToday("ebay"),
      getApiUsageToday("scrydex")
    ]);
    const history = await pool.query(
      `SELECT provider, date, call_count FROM api_usage ORDER BY date DESC, provider LIMIT 20`
    );
    const scannerRuns = await pool.query(
      `SELECT id, status, started_at, finished_at, deals_found, error
       FROM scanner_runs ORDER BY started_at DESC LIMIT 10`
    );
    const syncLogs = await pool.query(
      `SELECT id, type, status, started_at, finished_at, error
       FROM sync_log ORDER BY started_at DESC LIMIT 5`
    );
    res.json({
      ok: true,
      test: "usage",
      today: { ebay, scrydex },
      caps: { ebay: 5000, scrydex: 50000 },
      history: history.rows,
      recent_scans: scannerRuns.rows,
      recent_syncs: syncLogs.rows
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, test: "usage", error: error.message });
  }
});

// 9. Data integrity check
router.get("/integrity", requireAuth, async (_req, res) => {
  try {
    const start = Date.now();
    const checks: any[] = [];

    // Cards without prices
    const noPrices = await pool.query("SELECT COUNT(*)::int as c FROM cards WHERE market_price_usd IS NULL");
    checks.push({ check: "cards_no_market_price", count: noPrices.rows[0].c, status: "info" });

    // Cards without images
    const noImages = await pool.query("SELECT COUNT(*)::int as c FROM cards WHERE image_url IS NULL");
    checks.push({ check: "cards_no_image", count: noImages.rows[0].c, status: "info" });

    // Orphan cards (no expansion)
    const orphans = await pool.query(
      "SELECT COUNT(*)::int as c FROM cards c LEFT JOIN expansions e ON c.expansion_id = e.id WHERE e.id IS NULL"
    );
    checks.push({ check: "orphan_cards", count: orphans.rows[0].c, status: orphans.rows[0].c > 0 ? "warn" : "ok" });

    // Duplicate ebay items in deals
    const dupes = await pool.query(
      "SELECT ebay_item_id, COUNT(*)::int as c FROM deals GROUP BY ebay_item_id HAVING COUNT(*) > 1"
    );
    checks.push({ check: "duplicate_deals", count: dupes.rows.length, status: dupes.rows.length > 0 ? "warn" : "ok" });

    // Sample cards by rarity
    const rarities = await pool.query(
      "SELECT rarity, COUNT(*)::int as count FROM cards GROUP BY rarity ORDER BY count DESC LIMIT 15"
    );
    checks.push({ check: "rarity_distribution", data: rarities.rows, status: "info" });

    // Expansion coverage
    const expCoverage = await pool.query(
      `SELECT e.name, e.code, COUNT(c.id)::int as card_count
       FROM expansions e LEFT JOIN cards c ON e.id = c.expansion_id
       GROUP BY e.id, e.name, e.code ORDER BY card_count DESC LIMIT 10`
    );
    checks.push({ check: "top_expansions", data: expCoverage.rows, status: "info" });

    // pg_trgm test
    const trgm = await pool.query("SELECT similarity('charizard', 'Charizard VMAX') as score");
    checks.push({ check: "pg_trgm_working", similarity_score: trgm.rows[0].score, status: trgm.rows[0].score > 0 ? "ok" : "fail" });

    const elapsed = Date.now() - start;
    res.json({ ok: true, test: "integrity", elapsed_ms: elapsed, checks });
  } catch (error: any) {
    res.status(500).json({ ok: false, test: "integrity", error: error.message });
  }
});

// Run all quick tests
router.get("/", requireAuth, async (_req, res) => {
  const results: Record<string, any> = {};
  for (const [name, fn] of Object.entries({
    db: async () => {
      await pool.query("SELECT 1");
      const t = await pool.query("SELECT relname as t, n_live_tup as c FROM pg_stat_user_tables ORDER BY relname");
      return { tables: t.rows };
    },
    exchange: async () => {
      const rate = await getUsdToGbpRate();
      return { usd_to_gbp: rate };
    },
    scrydex: async () => {
      const page = await fetchCardsPage(1);
      return { cards_page1: (page.cards ?? []).length, has_more: page.hasMore };
    },
    ebay: async () => {
      const items = await searchItems("pokemon pikachu VMAX", 1, "183454", "price:[5..],buyingOptions:{FIXED_PRICE}");
      return { items: items.length, title: items[0]?.title?.slice(0, 60) };
    },
    match: async () => {
      const match = await matchListing("Pokemon Card Charizard 4/102 Base Set Holo", {});
      return match ? { matched: true, confidence: match.confidence, card_id: match.cardId } : { matched: false };
    }
  })) {
    const start = Date.now();
    try {
      const data = await fn();
      results[name] = { ok: true, elapsed_ms: Date.now() - start, ...data };
    } catch (error: any) {
      results[name] = { ok: false, elapsed_ms: Date.now() - start, error: error.response?.data ?? error.message };
    }
  }
  res.json(results);
});

export default router;
