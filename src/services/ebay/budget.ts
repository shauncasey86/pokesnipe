import pino from 'pino';
import type { BudgetStatus } from './types.js';

const logger = pino({ name: 'ebay-budget' });

function nextMidnightUTC(): Date {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return next;
}

const budget = {
  dailyLimit: 5000,
  used: 0,
  resetAt: nextMidnightUTC(),
};

function maybeReset(): void {
  if (Date.now() >= budget.resetAt.getTime()) {
    logger.info('Budget reset — new day');
    budget.used = 0;
    budget.resetAt = nextMidnightUTC();
  }
}

export function trackCall(): void {
  maybeReset();
  budget.used++;
}

export function getRemainingBudget(): number {
  maybeReset();
  return budget.dailyLimit - budget.used;
}

export function canMakeCall(): boolean {
  maybeReset();
  if (budget.used >= budget.dailyLimit) {
    logger.warn('eBay daily budget exhausted (%d/%d)', budget.used, budget.dailyLimit);
    return false;
  }
  return true;
}

export function getBudgetStatus(): BudgetStatus {
  maybeReset();
  const remaining = budget.dailyLimit - budget.used;
  return {
    dailyLimit: budget.dailyLimit,
    used: budget.used,
    remaining,
    resetAt: budget.resetAt,
    isLow: remaining < 500,
  };
}
