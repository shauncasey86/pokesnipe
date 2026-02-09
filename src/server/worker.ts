import "dotenv/config";
import pino from "pino";
import { runFullSync } from "./services/syncService";
import { scanEbay } from "./services/scannerService";
import { pool } from "./db/pool";

const logger = pino({ name: "worker" });

const trackedScan = async () => {
  const { rows } = await pool.query(
    "INSERT INTO scanner_runs (status) VALUES ('running') RETURNING id"
  );
  const runId = rows[0].id as number;
  try {
    const dealsBeforeCount = await pool.query("SELECT COUNT(*)::int as c FROM deals");
    const before = dealsBeforeCount.rows[0].c;
    await scanEbay();
    const dealsAfterCount = await pool.query("SELECT COUNT(*)::int as c FROM deals");
    const after = dealsAfterCount.rows[0].c;
    const found = after - before;
    await pool.query(
      "UPDATE scanner_runs SET status='completed', finished_at=now(), deals_found=$2 WHERE id=$1",
      [runId, found]
    );
    logger.info({ runId, dealsFound: found }, "scan completed");
  } catch (error) {
    await pool.query(
      "UPDATE scanner_runs SET status='failed', finished_at=now(), error=$2 WHERE id=$1",
      [runId, error instanceof Error ? error.message : "unknown error"]
    );
    throw error;
  }
};

const run = async () => {
  try {
    await runFullSync();
  } catch (error) {
    logger.error({ error }, "initial sync failed");
  }

  setInterval(() => {
    trackedScan().catch((error) => logger.error({ error }, "scan failed"));
  }, 1000 * 60 * 5);

  setInterval(() => {
    runFullSync().catch((error) => logger.error({ error }, "scheduled sync failed"));
  }, 1000 * 60 * 60 * 24);
};

run().catch((error) => {
  logger.error({ error }, "worker failed");
  process.exit(1);
});
