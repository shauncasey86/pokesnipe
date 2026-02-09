import { pool } from "../db/pool";

export const trackApiCall = async (provider: string, count = 1) => {
  await pool.query(
    `INSERT INTO api_usage (provider, date, call_count)
     VALUES ($1, CURRENT_DATE, $2)
     ON CONFLICT (provider, date) DO UPDATE
     SET call_count = api_usage.call_count + $2`,
    [provider, count]
  );
};

export const getApiUsageToday = async (provider: string): Promise<number> => {
  const { rows } = await pool.query(
    "SELECT call_count FROM api_usage WHERE provider = $1 AND date = CURRENT_DATE",
    [provider]
  );
  return rows[0]?.call_count ?? 0;
};
