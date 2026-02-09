import pg from "pg";
import { config } from "../config.js";

// Parse URL explicitly — Railway sets PGHOST/PGPORT env vars that
// override pg's connectionString, so we must pass individual params.
const dbUrl = new URL(config.DATABASE_URL);
console.log(`pool: connecting to ${dbUrl.hostname}:${dbUrl.port || 5432}/${dbUrl.pathname.slice(1)}`);
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
