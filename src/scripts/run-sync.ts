import pino from 'pino';
import { pool } from '../db/pool.js';
import { syncAll } from '../services/sync/sync-service.js';

const logger = pino({ name: 'run-sync' });

async function main(): Promise<void> {
  logger.info('Starting full card sync...');

  try {
    const result = await syncAll();
    logger.info(
      {
        expansions: result.expansions,
        cards: result.cards,
        variants: result.variants,
      },
      'Sync completed successfully',
    );
  } catch (error) {
    logger.error({ err: error }, 'Sync failed');
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
