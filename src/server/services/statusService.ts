import { pool } from "../db/pool.js";
import { getApiUsageToday } from "./apiUsageTracker.js";

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

  // API usage — query actual daily counts
  const [ebayUsed, scrydexUsed] = await Promise.all([
    getApiUsageToday("ebay"),
    getApiUsageToday("scrydex")
  ]);

  return {
    scanner: {
      status: scannerStatus,
      lastRun: lastRun?.finished_at ?? lastRun?.started_at ?? null
    },
    dealsToday: dealsToday.rows[0],
    accuracy: { rolling7d },
    apis: {
      ebay: { used: ebayUsed, cap: 5000 },
      scrydex: { used: scrydexUsed, cap: 50000 },
      index: { count: cardCount.rows[0]?.count ?? 0, lastSync: sync.rows[0]?.finished_at ?? null }
    }
  };
};
