import pg from "pg";
import { config } from "../config";

export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
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
