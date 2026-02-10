import pino from 'pino';
import { config } from '../../config/index.js';
import { pool } from '../../db/pool.js';

const logger = pino({ name: 'exchange-rate' });

const STALE_HOURS = 6;

export class ExchangeRateStaleError extends Error {
  constructor(fetchedAt: Date) {
    super(
      `Exchange rate is stale — last fetched at ${fetchedAt.toISOString()}, which is older than ${STALE_HOURS} hours`,
    );
    this.name = 'ExchangeRateStaleError';
  }
}

async function fetchRate(): Promise<{ rate: number; fetchedAt: Date }> {
  const url = `https://v6.exchangerate-api.com/v6/${config.EXCHANGE_RATE_API_KEY}/pair/USD/GBP`;
  logger.info('Fetching USD→GBP exchange rate from API...');

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Exchange rate API returned ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as { result: string; conversion_rate: number };
  if (data.result !== 'success') {
    throw new Error(`Exchange rate API error: ${JSON.stringify(data)}`);
  }

  const rate = data.conversion_rate;
  logger.info({ rate }, 'Fetched USD→GBP rate');
  return { rate, fetchedAt: new Date() };
}

async function saveRate(rate: number): Promise<void> {
  await pool.query(
    `INSERT INTO exchange_rates (from_currency, to_currency, rate) VALUES ('USD', 'GBP', $1)`,
    [rate],
  );
  logger.info({ rate }, 'Saved exchange rate to database');
}

async function getLatestRate(): Promise<{ rate: number; fetchedAt: Date } | null> {
  const { rows } = await pool.query<{ rate: string; fetched_at: Date }>(
    `SELECT rate, fetched_at FROM exchange_rates
       WHERE from_currency = 'USD' AND to_currency = 'GBP'
       ORDER BY fetched_at DESC LIMIT 1`,
  );
  if (rows.length === 0) return null;
  return { rate: parseFloat(rows[0].rate), fetchedAt: rows[0].fetched_at };
}

function isStale(fetchedAt: Date): boolean {
  const ageMs = Date.now() - fetchedAt.getTime();
  return ageMs > STALE_HOURS * 60 * 60 * 1000;
}

/**
 * HARD GATE — called by the pricing engine.
 * Returns the rate if fresh, throws if stale or missing.
 */
export async function getValidRate(): Promise<number> {
  const latest = await getLatestRate();
  if (!latest) {
    throw new Error('No exchange rate in database — run refreshRate() first');
  }
  if (isStale(latest.fetchedAt)) {
    throw new ExchangeRateStaleError(latest.fetchedAt);
  }
  return latest.rate;
}

/**
 * Fetch a fresh rate from the API and save it to the database.
 * Called on boot and by scheduled jobs.
 */
export async function refreshRate(): Promise<number> {
  const { rate } = await fetchRate();
  await saveRate(rate);
  return rate;
}
