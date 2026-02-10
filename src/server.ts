import pino from 'pino';
import { config } from './config/index.js';
import { pool } from './db/pool.js';
import { runMigrations } from './db/migrate.js';
import app from './app.js';

const logger = pino({ name: 'server' });

async function boot(): Promise<void> {
  // Step 1: Config already validated by Zod at import time
  logger.info('Configuration validated');

  // Step 2: Test database connection
  logger.info('Connecting to database...');
  await pool.query('SELECT 1');
  logger.info('Database connected');

  // Step 3: Run migrations
  await runMigrations();

  // Step 4: Start Express
  app.listen(config.PORT, () => {
    logger.info(`Server ready on port ${config.PORT}`);
  });
}

boot().catch((err) => {
  logger.error({ err }, 'Boot failed');
  process.exit(1);
});
