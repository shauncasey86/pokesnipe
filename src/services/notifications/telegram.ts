import pino from 'pino';

const log = pino({ name: 'telegram' });

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

/**
 * Check if Telegram is configured.
 */
export function isTelegramConfigured(): boolean {
  return !!(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID);
}

/**
 * Send a message via Telegram Bot API.
 * Silently skips if Telegram is not configured.
 */
export async function sendMessage(text: string, parseMode: 'HTML' | 'Markdown' = 'HTML'): Promise<boolean> {
  if (!isTelegramConfigured()) return false;

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text,
          parse_mode: parseMode,
        }),
      }
    );

    if (!res.ok) {
      const body = await res.text();
      log.warn({ status: res.status, body }, 'Telegram send failed');
      return false;
    }

    return true;
  } catch (err) {
    log.error({ err }, 'Telegram send error');
    return false;
  }
}

/**
 * Send a system alert (warning or critical).
 */
export async function sendAlert(
  severity: 'critical' | 'warning',
  title: string,
  details: string
): Promise<void> {
  const emoji = severity === 'critical' ? '🚨' : '⚠️';
  const text = `${emoji} <b>${title}</b>\n${details}`;
  await sendMessage(text);
}

/**
 * Send a test message to verify Telegram configuration.
 */
export async function sendTestMessage(): Promise<boolean> {
  return sendMessage('✅ <b>PokeSnipe</b> — Telegram integration working!');
}
