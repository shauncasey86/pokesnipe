import pg from 'pg';
import pino from 'pino';
import { config } from '../config/index.js';

const logger = pino({ name: 'db' });

export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: 10,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected error on idle database client');
});
