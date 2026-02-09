import pg from "pg";
import { config } from "../config.js";

// Parse URL explicitly so Railway's PGHOST/PGPORT env vars don't override it
const dbUrl = new URL(config.DATABASE_URL);
export const pool = new pg.Pool({
  host: dbUrl.hostname,
  port: parseInt(dbUrl.port, 10) || 5432,
  database: dbUrl.pathname.slice(1),
  user: decodeURIComponent(dbUrl.username),
  password: decodeURIComponent(dbUrl.password),
  max: 10
});

export const withClient = async <T>(fn: (client: pg.PoolClient) => Promise<T>) => {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
};
