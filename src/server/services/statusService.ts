import { pool } from "../db/pool";

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
  return {
    scanner: { status: "hunting", lastRun: null },
    dealsToday: dealsToday.rows[0],
    accuracy: { rolling7d },
    apis: {
      ebay: { used: 0, cap: 5000 },
      scrydex: { used: 0, cap: 50000 },
      index: { count: cardCount.rows[0]?.count ?? 0, lastSync: sync.rows[0]?.finished_at ?? null }
    }
  };
};
