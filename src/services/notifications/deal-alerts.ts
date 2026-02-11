import { sendMessage, isTelegramConfigured } from './telegram.js';
import pino from 'pino';

const log = pino({ name: 'deal-alerts' });

export interface DealAlertData {
  cardName: string;
  cardNumber?: string;
  expansionName?: string;
  ebayPriceGBP: number;
  marketPriceGBP: number;
  profitGBP: number;
  profitPercent: number;
  tier: string;
  condition: string;
  confidence: number;
  ebayUrl: string;
}

// Debounce: don't send more than 1 alert per 30 seconds
let lastAlertTime = 0;
const ALERT_COOLDOWN_MS = 30_000;

/**
 * Send a Telegram alert for a high-value deal.
 * Only sends for GRAIL and HIT tiers by default.
 */
export async function sendDealAlert(deal: DealAlertData): Promise<void> {
  if (!isTelegramConfigured()) return;

  // Only alert for GRAIL and HIT
  if (deal.tier !== 'GRAIL' && deal.tier !== 'HIT') return;

  // Cooldown — prevent spam during big scan batches
  const now = Date.now();
  if (now - lastAlertTime < ALERT_COOLDOWN_MS) {
    log.debug({ tier: deal.tier }, 'Deal alert skipped (cooldown)');
    return;
  }
  lastAlertTime = now;

  const tierEmoji = deal.tier === 'GRAIL' ? '💎' : '🔥';
  const tierLabel = deal.tier === 'GRAIL' ? 'GRAIL DEAL' : 'HIT DEAL';

  const text = [
    `${tierEmoji} <b>${tierLabel}</b>`,
    `<b>${deal.cardName}</b>${deal.cardNumber ? ` ${deal.cardNumber}` : ''}${deal.expansionName ? ` — ${deal.expansionName}` : ''}`,
    `eBay: £${deal.ebayPriceGBP.toFixed(2)} → Market: £${deal.marketPriceGBP.toFixed(2)}`,
    `Profit: <b>+£${deal.profitGBP.toFixed(2)} (+${deal.profitPercent.toFixed(0)}%)</b>`,
    `Condition: ${deal.condition} · Confidence: ${deal.confidence.toFixed(2)}`,
    `<a href="${deal.ebayUrl}">Open on eBay →</a>`,
  ].join('\n');

  const sent = await sendMessage(text);
  if (sent) {
    log.info({ tier: deal.tier, cardName: deal.cardName }, 'Deal alert sent');
  }
}
