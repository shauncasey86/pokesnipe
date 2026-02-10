import { runner } from 'node-pg-migrate';
import path from 'node:path';
import pino from 'pino';
import { config } from '../config/index.js';

const logger = pino({ name: 'migrate' });

export async function runMigrations(): Promise<void> {
  logger.info('Running database migrations...');

  await runner({
    databaseUrl: config.DATABASE_URL,
    dir: path.resolve('migrations'),
    direction: 'up',
    migrationsTable: 'pgmigrations',
    log: (msg: string) => logger.info(msg),
  });

  logger.info('Migrations completed successfully');
}

// Allow running as standalone script: npm run migrate
if (process.argv[1]?.endsWith('migrate.ts')) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error({ err }, 'Migration failed');
      process.exit(1);
    });
}
