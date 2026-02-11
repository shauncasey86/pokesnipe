import { Router, Request, Response } from 'express';
import { sendTestMessage, isTelegramConfigured } from '../services/notifications/index.js';

const router = Router();

/**
 * POST /api/notifications/telegram/test — Send a test Telegram message.
 */
router.post('/telegram/test', async (req: Request, res: Response) => {
  if (!isTelegramConfigured()) {
    return res.status(400).json({
      error: 'Telegram not configured',
      detail: 'Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID as Railway service variables',
    });
  }

  const sent = await sendTestMessage();
  if (sent) {
    return res.json({ success: true, message: 'Test message sent' });
  }
  return res.status(500).json({ error: 'Failed to send test message' });
});

export default router;
