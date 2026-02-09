// src/middleware/rate-limiter.ts
// ═══════════════════════════════════════════════════════════════════════════
// Rate Limiter Middleware - Protects API endpoints from abuse
// ═══════════════════════════════════════════════════════════════════════════

import { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * Simple in-memory rate limiter
 * For production, consider using Redis for distributed rate limiting
 */
class RateLimiter {
  private store: Map<string, RateLimitEntry> = new Map();
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(windowMs: number, maxRequests: number) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;

    // Cleanup expired entries every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Check if request should be allowed
   */
  check(key: string): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || now >= entry.resetAt) {
      // New window
      const resetAt = now + this.windowMs;
      this.store.set(key, { count: 1, resetAt });
      return { allowed: true, remaining: this.maxRequests - 1, resetAt };
    }

    if (entry.count >= this.maxRequests) {
      // Rate limit exceeded
      return { allowed: false, remaining: 0, resetAt: entry.resetAt };
    }

    // Increment count
    entry.count++;
    return { allowed: true, remaining: this.maxRequests - entry.count, resetAt: entry.resetAt };
  }

  /**
   * Remove expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, entry] of this.store.entries()) {
      if (now >= entry.resetAt) {
        this.store.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      logger.debug({ event: 'RATE_LIMIT_CLEANUP', entriesRemoved: cleaned });
    }
  }

  /**
   * Get current store size
   */
  size(): number {
    return this.store.size;
  }

  /**
   * Destroy the rate limiter
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.store.clear();
  }
}

// Create rate limiter instances for different tiers
const apiRateLimiter = new RateLimiter(
  config.rateLimit.windowMs,
  config.rateLimit.maxRequests
);

// Stricter limit for scan endpoints to prevent abuse
const scanRateLimiter = new RateLimiter(
  config.rateLimit.windowMs,
  Math.floor(config.rateLimit.maxRequests / 10) // 10x stricter
);

/**
 * Extract client identifier from request
 */
function getClientKey(req: Request): string {
  // Use X-Forwarded-For for proxied requests (Railway, etc.)
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return ip.trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/**
 * Standard API rate limiter middleware
 */
export function rateLimiter(req: Request, res: Response, next: NextFunction): void {
  // Skip in development if configured
  if (config.isDev && config.rateLimit.skipInDev) {
    return next();
  }

  const key = getClientKey(req);
  const result = apiRateLimiter.check(key);

  // Set rate limit headers
  res.setHeader('X-RateLimit-Limit', config.rateLimit.maxRequests);
  res.setHeader('X-RateLimit-Remaining', result.remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000));

  if (!result.allowed) {
    const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
    res.setHeader('Retry-After', retryAfter);

    logger.warn({
      event: 'RATE_LIMIT_EXCEEDED',
      clientKey: key,
      path: req.path,
      retryAfter,
    });

    res.status(429).json({
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter,
    });
    return;
  }

  next();
}

/**
 * Stricter rate limiter for scan endpoints
 */
export function scanRateLimiterMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip in development if configured
  if (config.isDev && config.rateLimit.skipInDev) {
    return next();
  }

  const key = `scan:${getClientKey(req)}`;
  const maxScanRequests = Math.floor(config.rateLimit.maxRequests / 10);
  const result = scanRateLimiter.check(key);

  res.setHeader('X-RateLimit-Limit', maxScanRequests);
  res.setHeader('X-RateLimit-Remaining', result.remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000));

  if (!result.allowed) {
    const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
    res.setHeader('Retry-After', retryAfter);

    logger.warn({
      event: 'SCAN_RATE_LIMIT_EXCEEDED',
      clientKey: key,
      path: req.path,
      retryAfter,
    });

    res.status(429).json({
      error: 'Too many scan requests',
      message: 'Scan rate limit exceeded. Please try again later.',
      retryAfter,
    });
    return;
  }

  next();
}

/**
 * Get rate limiter stats (for health checks)
 */
export function getRateLimiterStats(): { api: number; scan: number } {
  return {
    api: apiRateLimiter.size(),
    scan: scanRateLimiter.size(),
  };
}

/**
 * Cleanup rate limiters (for graceful shutdown)
 */
export function destroyRateLimiters(): void {
  apiRateLimiter.destroy();
  scanRateLimiter.destroy();
}
