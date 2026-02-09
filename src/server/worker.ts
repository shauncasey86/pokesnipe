import "dotenv/config";
import pino from "pino";
import { runFullSync } from "./services/syncService";
import { scanEbay } from "./services/scannerService";

const logger = pino({ name: "worker" });

const run = async () => {
  try {
    await runFullSync();
  } catch (error) {
    logger.error({ error }, "initial sync failed");
  }

  setInterval(() => {
    scanEbay().catch((error) => logger.error({ error }, "scan failed"));
  }, 1000 * 60 * 5);

  setInterval(() => {
    runFullSync().catch((error) => logger.error({ error }, "scheduled sync failed"));
  }, 1000 * 60 * 60 * 24);
};

run().catch((error) => {
  logger.error({ error }, "worker failed");
  process.exit(1);
});
