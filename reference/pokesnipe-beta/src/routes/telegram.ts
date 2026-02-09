// src/routes/telegram.ts
// ═══════════════════════════════════════════════════════════════════════════
// Telegram Settings Routes
// ═══════════════════════════════════════════════════════════════════════════

import { Router, Request, Response } from 'express';
import { telegramService } from '../services/telegram/index.js';
import { getPool } from '../services/database/postgres.js';
import { logger } from '../utils/logger.js';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/telegram/config - Get current Telegram configuration
// ─────────────────────────────────────────────────────────────────────────────

router.get('/config', async (_req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool();
    if (!pool) {
      res.json({
        status: 'ok',
        config: {
          enabled: false,
          configured: false,
        },
      });
      return;
    }

    const result = await pool.query(`
      SELECT
        telegram_enabled,
        telegram_bot_token,
        telegram_chat_id,
        telegram_min_profit,
        telegram_min_discount,
        telegram_alert_premium,
        telegram_alert_high,
        telegram_alert_standard
      FROM user_preferences WHERE id = 1
    `);

    if (result.rows.length === 0) {
      res.json({
        status: 'ok',
        config: {
          enabled: false,
          configured: false,
        },
      });
      return;
    }

    const prefs = result.rows[0];

    res.json({
      status: 'ok',
      config: {
        enabled: prefs.telegram_enabled || false,
        configured: !!(prefs.telegram_bot_token && prefs.telegram_chat_id),
        // Don't expose full token, just show if set
        hasToken: !!prefs.telegram_bot_token,
        hasChatId: !!prefs.telegram_chat_id,
        chatId: prefs.telegram_chat_id || null,
        minProfit: parseFloat(prefs.telegram_min_profit) || 0,
        minDiscount: parseFloat(prefs.telegram_min_discount) || 0,
        alertPremium: prefs.telegram_alert_premium !== false,
        alertHigh: prefs.telegram_alert_high !== false,
        alertStandard: prefs.telegram_alert_standard || false,
      },
    });
  } catch (error) {
    logger.error('Failed to get Telegram config:', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      status: 'error',
      message: 'Failed to get Telegram configuration',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/telegram/config - Update Telegram configuration
// ─────────────────────────────────────────────────────────────────────────────

router.post('/config', async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(500).json({
        status: 'error',
        message: 'Database not connected',
      });
      return;
    }

    const {
      enabled,
      botToken,
      chatId,
      minProfit,
      minDiscount,
      alertPremium,
      alertHigh,
      alertStandard,
    } = req.body;

    // Build update query dynamically based on what's provided
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (typeof enabled === 'boolean') {
      updates.push(`telegram_enabled = $${paramIndex++}`);
      values.push(enabled);
    }

    if (botToken !== undefined) {
      updates.push(`telegram_bot_token = $${paramIndex++}`);
      values.push(botToken || null);
    }

    if (chatId !== undefined) {
      updates.push(`telegram_chat_id = $${paramIndex++}`);
      values.push(chatId || null);
    }

    if (minProfit !== undefined) {
      updates.push(`telegram_min_profit = $${paramIndex++}`);
      values.push(parseFloat(minProfit) || 0);
    }

    if (minDiscount !== undefined) {
      updates.push(`telegram_min_discount = $${paramIndex++}`);
      values.push(parseFloat(minDiscount) || 0);
    }

    if (typeof alertPremium === 'boolean') {
      updates.push(`telegram_alert_premium = $${paramIndex++}`);
      values.push(alertPremium);
    }

    if (typeof alertHigh === 'boolean') {
      updates.push(`telegram_alert_high = $${paramIndex++}`);
      values.push(alertHigh);
    }

    if (typeof alertStandard === 'boolean') {
      updates.push(`telegram_alert_standard = $${paramIndex++}`);
      values.push(alertStandard);
    }

    if (updates.length === 0) {
      res.status(400).json({
        status: 'error',
        message: 'No valid fields to update',
      });
      return;
    }

    await pool.query(
      `UPDATE user_preferences SET ${updates.join(', ')} WHERE id = 1`,
      values
    );

    logger.info('TELEGRAM_CONFIG_UPDATED', {
      fieldsUpdated: updates.length,
    });

    res.json({
      status: 'ok',
      message: 'Telegram configuration updated',
    });
  } catch (error) {
    logger.error('Failed to update Telegram config:', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      status: 'error',
      message: 'Failed to update Telegram configuration',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/telegram/test - Test Telegram connection
// ─────────────────────────────────────────────────────────────────────────────

router.post('/test', async (req: Request, res: Response): Promise<void> => {
  try {
    const { botToken, chatId } = req.body;

    const result = await telegramService.testConnection(botToken, chatId);

    if (result.success) {
      res.json({
        status: 'ok',
        message: result.message,
      });
    } else {
      res.status(400).json({
        status: 'error',
        message: result.message,
      });
    }
  } catch (error) {
    logger.error('Telegram test failed:', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      status: 'error',
      message: 'Failed to test Telegram connection',
    });
  }
});

export default router;
