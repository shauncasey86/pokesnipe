import { pool } from "../db/pool.js";
import { getApiUsageToday } from "./apiUsageTracker.js";
import { ebayRateLimit } from "./ebayClient.js";
import { fetchScrydexUsage } from "./scrydexClient.js";

export const getStatus = async () => {
  const dealsToday = await pool.query(
    "SELECT COUNT(*)::int as total, SUM(CASE WHEN tier='grail' THEN 1 ELSE 0 END)::int as grail, SUM(CASE WHEN tier='hit' THEN 1 ELSE 0 END)::int as hit FROM deals WHERE created_at::date = CURRENT_DATE"
  );
  const sync = await pool.query(
    "SELECT status, finished_at FROM sync_log ORDER BY started_at DESC LIMIT 1"
  );
  const cardCount = await pool.query("SELECT COUNT(*)::int as count FROM cards");
  const acc = await pool.query(
    `SELECT COUNT(*)::int as total, SUM(CASE WHEN review_correct = true THEN 1 ELSE 0 END)::int as correct
     FROM deals WHERE review_correct IS NOT NULL AND created_at > NOW() - INTERVAL '7 days'`
  );
  const accRow = acc.rows[0];
  const rolling7d = accRow.total > 0 ? accRow.correct / accRow.total : null;

  // Scanner lastRun — query scanner_runs table
  const scannerRun = await pool.query(
    "SELECT started_at, finished_at, status, deals_found FROM scanner_runs ORDER BY started_at DESC LIMIT 1"
  );
  const lastRun = scannerRun.rows[0] ?? null;
  const scannerStatus = lastRun
    ? lastRun.status === "running" ? "running"
      : lastRun.finished_at && (Date.now() - new Date(lastRun.finished_at).getTime()) < 30 * 60 * 1000 ? "hunting"
      : "stale"
    : "hunting";

  // eBay: use rate-limit headers from actual API responses (captured in ebayClient)
  const ebayLocal = await getApiUsageToday("ebay");
  const ebayUsed = ebayRateLimit.used > 0 ? ebayRateLimit.used : ebayLocal;
  const ebayCap = ebayRateLimit.limit > 0 ? ebayRateLimit.limit : 5000;

  // Scrydex: call actual /account/v1/usage endpoint (cached for 30 min)
  let scrydexUsed = 0;
  let scrydexCap = 50000;
  let scrydexUsage: any = null;
  try {
    scrydexUsage = await fetchScrydexUsage();
    scrydexUsed = scrydexUsage?.credits_used ?? scrydexUsage?.used ?? scrydexUsage?.api_calls ?? 0;
    scrydexCap = scrydexUsage?.credits_limit ?? scrydexUsage?.limit ?? scrydexUsage?.credits_total ?? 50000;
  } catch {
    // Fallback to local DB count if Scrydex usage endpoint fails
    scrydexUsed = await getApiUsageToday("scrydex");
  }

  return {
    scanner: {
      status: scannerStatus,
      lastRun: lastRun?.finished_at ?? lastRun?.started_at ?? null
    },
    dealsToday: dealsToday.rows[0],
    accuracy: { rolling7d },
    apis: {
      ebay: { used: ebayUsed, cap: ebayCap, remaining: ebayRateLimit.remaining, source: ebayRateLimit.used > 0 ? "api" : "local" },
      scrydex: { used: scrydexUsed, cap: scrydexCap, raw: scrydexUsage, source: scrydexUsage ? "api" : "local" },
      index: { count: cardCount.rows[0]?.count ?? 0, lastSync: sync.rows[0]?.finished_at ?? null }
    }
  };
};
