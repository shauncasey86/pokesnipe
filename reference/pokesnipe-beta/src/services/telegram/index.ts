// src/services/telegram/index.ts
// ═══════════════════════════════════════════════════════════════════════════
// Telegram Bot Service - Send deal alerts to Telegram
// ═══════════════════════════════════════════════════════════════════════════

import axios from 'axios';
import { logger } from '../../utils/logger.js';
import { getPool } from '../database/postgres.js';
import type { Deal } from '../arbitrage/types.js';

interface TelegramConfig {
  enabled: boolean;
  botToken: string | null;
  chatId: string | null;
  minProfitGBP: number;
  minDiscountPercent: number;
  alertOnPremium: boolean;
  alertOnHigh: boolean;
  alertOnStandard: boolean;
}

class TelegramService {
  private config: TelegramConfig = {
    enabled: false,
    botToken: null,
    chatId: null,
    minProfitGBP: 0,
    minDiscountPercent: 0,
    alertOnPremium: true,
    alertOnHigh: true,
    alertOnStandard: false,
  };

  private lastConfigLoad: number = 0;
  private readonly CONFIG_CACHE_MS = 60000; // Reload config every 60s

  // ───────────────────────────────────────────────────────────────────────────
  // Configuration
  // ───────────────────────────────────────────────────────────────────────────

  async loadConfig(): Promise<void> {
    const now = Date.now();
    if (now - this.lastConfigLoad < this.CONFIG_CACHE_MS) {
      return;
    }

    try {
      const pool = getPool();
      if (!pool) return;

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

      if (result.rows.length > 0) {
        const prefs = result.rows[0];
        this.config = {
          enabled: prefs.telegram_enabled || false,
          botToken: prefs.telegram_bot_token || null,
          chatId: prefs.telegram_chat_id || null,
          minProfitGBP: parseFloat(prefs.telegram_min_profit) || 0,
          minDiscountPercent: parseFloat(prefs.telegram_min_discount) || 0,
          alertOnPremium: prefs.telegram_alert_premium !== false,
          alertOnHigh: prefs.telegram_alert_high !== false,
          alertOnStandard: prefs.telegram_alert_standard || false,
        };
      }

      this.lastConfigLoad = now;
    } catch (error) {
      logger.error('Failed to load Telegram config:', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  isConfigured(): boolean {
    return !!(this.config.enabled && this.config.botToken && this.config.chatId);
  }

  getConfig(): TelegramConfig {
    return { ...this.config };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Send Messages
  // ───────────────────────────────────────────────────────────────────────────

  async sendMessage(text: string, parseMode: 'HTML' | 'Markdown' = 'HTML'): Promise<boolean> {
    await this.loadConfig();

    if (!this.isConfigured()) {
      return false;
    }

    try {
      const url = `https://api.telegram.org/bot${this.config.botToken}/sendMessage`;

      await axios.post(url, {
        chat_id: this.config.chatId,
        text,
        parse_mode: parseMode,
        disable_web_page_preview: false,
      });

      logger.debug('TELEGRAM_MESSAGE_SENT', { length: text.length });
      return true;
    } catch (error) {
      logger.error('TELEGRAM_SEND_FAILED', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Deal Alerts
  // ───────────────────────────────────────────────────────────────────────────

  async sendDealAlert(deal: Deal): Promise<boolean> {
    await this.loadConfig();

    if (!this.isConfigured()) {
      return false;
    }

    // If it made it to the dashboard, send the alert - no additional filtering
    // The arbitrage engine already applied all the user's preferences

    // Build message
    const caption = this.formatDealMessage(deal);

    // Send with image if available, otherwise text only
    const imageUrl = deal.imageUrl;
    if (imageUrl) {
      return this.sendPhoto(imageUrl, caption);
    }
    return this.sendMessage(caption);
  }

  async sendPhoto(photoUrl: string, caption: string): Promise<boolean> {
    if (!this.isConfigured()) {
      return false;
    }

    try {
      const url = `https://api.telegram.org/bot${this.config.botToken}/sendPhoto`;

      await axios.post(url, {
        chat_id: this.config.chatId,
        photo: photoUrl,
        caption,
        parse_mode: 'HTML',
      });

      logger.debug('TELEGRAM_PHOTO_SENT', { captionLength: caption.length });
      return true;
    } catch (error) {
      // Fall back to text message if photo fails
      logger.warn('TELEGRAM_PHOTO_FAILED', {
        error: error instanceof Error ? error.message : String(error),
        fallback: 'text',
      });
      return this.sendMessage(caption);
    }
  }

  private formatDealMessage(deal: Deal): string {
    const tierEmoji: Record<string, string> = {
      PREMIUM: '💎',
      HIGH: '🔥',
      STANDARD: '✨',
    };

    const emoji = tierEmoji[deal.tier || 'STANDARD'] || '✨';
    const tierLabel = deal.tier || 'STANDARD';

    // Format card info
    const cardInfo = deal.isGraded
      ? `${deal.gradingCompany} ${deal.grade} - ${deal.cardName}`
      : deal.cardName;

    const setInfo = deal.expansionName ? `Set: ${deal.expansionName}` : '';
    const numberInfo = deal.cardNumber ? `#${deal.cardNumber}` : '';

    // Format prices
    const ebayPrice = `£${(deal.ebayPrice || deal.ebayPriceGBP || 0).toFixed(2)}`;
    const marketPrice = `£${(deal.marketValueGBP || 0).toFixed(2)}`;
    const profit = `£${(deal.profitGBP || 0).toFixed(2)}`;
    const discount = `${(deal.discountPercent || 0).toFixed(0)}%`;

    // Build message with HTML formatting
    const lines = [
      `${emoji} <b>New ${tierLabel} Deal!</b>`,
      ``,
      `<b>${cardInfo}</b>`,
      setInfo ? `${setInfo} ${numberInfo}` : numberInfo,
      deal.condition ? `Condition: ${deal.condition}` : '',
      ``,
      `━━━━━━━━━━━━━━━`,
      `💰 eBay: <b>${ebayPrice}</b>`,
      `📊 Market: ${marketPrice}`,
      `✨ Profit: <b>${profit}</b> (${discount} off)`,
      `━━━━━━━━━━━━━━━`,
      ``,
      `<a href="${deal.ebayUrl}">🔗 View on eBay</a>`,
    ];

    return lines.filter(line => line !== '').join('\n');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Test Connection
  // ───────────────────────────────────────────────────────────────────────────

  async testConnection(botToken?: string, chatId?: string): Promise<{ success: boolean; message: string }> {
    const token = botToken || this.config.botToken;
    const chat = chatId || this.config.chatId;

    if (!token || !chat) {
      return { success: false, message: 'Bot token and chat ID are required' };
    }

    try {
      const url = `https://api.telegram.org/bot${token}/sendMessage`;

      await axios.post(url, {
        chat_id: chat,
        text: '✅ PokeSnipe Telegram alerts connected successfully!\n\nYou will receive deal notifications here.',
        parse_mode: 'HTML',
      });

      return { success: true, message: 'Test message sent successfully!' };
    } catch (error) {
      const axiosError = error as { response?: { data?: { description?: string } } };
      const errorMsg = axiosError.response?.data?.description ||
                       (error instanceof Error ? error.message : 'Unknown error');

      return { success: false, message: errorMsg };
    }
  }
}

export const telegramService = new TelegramService();
