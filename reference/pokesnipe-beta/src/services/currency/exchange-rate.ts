// ═══════════════════════════════════════════════════════════════════════════
// Exchange Rate Service - USD to GBP conversion
// With retry logic and exponential backoff for API reliability
// ═══════════════════════════════════════════════════════════════════════════

import axios from 'axios';
import { logger } from '../../utils/logger.js';

interface ExchangeRates {
  base: string;
  date: string;
  rates: Record<string, number>;
  isLive: boolean;
}

class ExchangeRateService {
  private cachedRates: ExchangeRates | null = null;
  private cacheTime: number = 0;
  private static readonly CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
  private static readonly FALLBACK_USD_RATE = 1.27; // Fallback if API fails
  private static readonly MAX_RETRIES = 3;
  private static readonly INITIAL_TIMEOUT_MS = 15000; // 15 seconds

  // ─────────────────────────────────────────────────────────────────────────
  // Retry Helper with Exponential Backoff
  // ─────────────────────────────────────────────────────────────────────────

  private async fetchWithRetry(): Promise<ExchangeRates> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < ExchangeRateService.MAX_RETRIES; attempt++) {
      try {
        // Increase timeout with each retry
        const timeout = ExchangeRateService.INITIAL_TIMEOUT_MS * (attempt + 1);

        const response = await axios.get('https://api.frankfurter.app/latest', {
          params: {
            from: 'GBP',
            to: 'USD',
          },
          timeout,
        });

        return {
          base: 'GBP',
          date: response.data.date,
          rates: response.data.rates,
          isLive: true,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < ExchangeRateService.MAX_RETRIES - 1) {
          // Exponential backoff: 2s, 4s, 8s
          const backoffMs = Math.pow(2, attempt + 1) * 1000;
          logger.warn('EXCHANGE_RATE_RETRY', {
            attempt: attempt + 1,
            maxRetries: ExchangeRateService.MAX_RETRIES,
            backoffMs,
            error: lastError.message,
          });
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
      }
    }

    throw lastError || new Error('All retry attempts failed');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Get Exchange Rates
  // ─────────────────────────────────────────────────────────────────────────

  async getRates(): Promise<ExchangeRates> {
    // Return cached if valid
    if (this.cachedRates && Date.now() - this.cacheTime < ExchangeRateService.CACHE_TTL_MS) {
      return this.cachedRates;
    }

    try {
      // Use Frankfurter API (free, no key required) with retry logic
      this.cachedRates = await this.fetchWithRetry();
      this.cacheTime = Date.now();

      logger.info('EXCHANGE_RATE_UPDATED', {
        usdRate: this.cachedRates.rates.USD,
        date: this.cachedRates.date,
      });

      return this.cachedRates;
    } catch (error) {
      logger.warn('EXCHANGE_RATE_ERROR', {
        error: String(error),
        usingFallback: ExchangeRateService.FALLBACK_USD_RATE,
      });

      // Return fallback rates
      return {
        base: 'GBP',
        date: new Date().toISOString().split('T')[0],
        rates: { USD: ExchangeRateService.FALLBACK_USD_RATE },
        isLive: false,
      };
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Convert USD to GBP
  // ─────────────────────────────────────────────────────────────────────────
  
  async usdToGbp(amountUSD: number): Promise<number> {
    const rates = await this.getRates();
    const usdRate = rates.rates.USD || ExchangeRateService.FALLBACK_USD_RATE;
    return amountUSD / usdRate;
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Convert GBP to USD
  // ─────────────────────────────────────────────────────────────────────────
  
  async gbpToUsd(amountGBP: number): Promise<number> {
    const rates = await this.getRates();
    const usdRate = rates.rates.USD || ExchangeRateService.FALLBACK_USD_RATE;
    return amountGBP * usdRate;
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Get Current USD Rate
  // ─────────────────────────────────────────────────────────────────────────

  async getUsdRate(): Promise<number> {
    const rates = await this.getRates();
    return rates.rates.USD || ExchangeRateService.FALLBACK_USD_RATE;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Check if Rate is Live (from API vs fallback)
  // ─────────────────────────────────────────────────────────────────────────

  async isRateLive(): Promise<boolean> {
    const rates = await this.getRates();
    return rates.isLive;
  }
}

export const exchangeRate = new ExchangeRateService();