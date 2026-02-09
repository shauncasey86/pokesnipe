import { pool } from "../db/pool";

export const getStatus = async () => {
  const dealsToday = await pool.query(
    "SELECT COUNT(*)::int as total, SUM(CASE WHEN tier='grail' THEN 1 ELSE 0 END)::int as grail, SUM(CASE WHEN tier='hit' THEN 1 ELSE 0 END)::int as hit FROM deals WHERE created_at::date = CURRENT_DATE"
  );
  const sync = await pool.query(
    "SELECT status, finished_at FROM sync_log ORDER BY started_at DESC LIMIT 1"
  );
  const cardCount = await pool.query("SELECT COUNT(*)::int as count FROM cards");
  return {
    scanner: { status: "hunting", lastRun: null },
    dealsToday: dealsToday.rows[0],
    accuracy: { rolling7d: 0.91 },
    apis: {
      ebay: { used: 0, cap: 5000 },
      scrydex: { used: 0, cap: 50000 },
      index: { count: cardCount.rows[0]?.count ?? 0, lastSync: sync.rows[0]?.finished_at ?? null }
    }
  };
};
