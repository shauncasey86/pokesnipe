import pg from "pg";
import { default as runner } from "node-pg-migrate";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("migrate: DATABASE_URL is not set, skipping migrations");
  process.exit(0);
}

// Parse URL explicitly — Railway sets PGHOST/PGPORT env vars that
// override pg's connectionString, so we must pass individual params.
const dbUrl = new URL(url);
const host = dbUrl.hostname;
const port = parseInt(dbUrl.port, 10) || 5432;

console.log(`migrate: connecting to ${host}:${port}/${dbUrl.pathname.slice(1)}`);

const client = new pg.Client({
  host,
  port,
  database: dbUrl.pathname.slice(1),
  user: decodeURIComponent(dbUrl.username),
  password: decodeURIComponent(dbUrl.password),
});

try {
  await client.connect();
  console.log("migrate: connected, running migrations...");
  await runner({
    dbClient: client,
    migrationsTable: "pgmigrations",
    dir: "migrations",
    direction: "up",
    count: Infinity,
    log: console.log,
  });
  console.log("migrate: done");
} catch (err) {
  console.error("migrate: migration failed, continuing startup anyway", err.message || err);
} finally {
  await client.end().catch(() => {});
}
