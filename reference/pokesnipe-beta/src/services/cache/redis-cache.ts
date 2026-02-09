// src/services/cache/redis-cache.ts
import { Redis } from 'ioredis';
import { MemoryCache } from './memory-cache.js';
import { logger } from '../../utils/logger.js';
import { config } from '../../config/index.js';

export interface CacheInterface {
  get<T>(key: string): Promise<T | null> | T | null;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> | void;
  delete(key: string): Promise<boolean> | boolean;
  clear(): Promise<void> | void;
  has(key: string): Promise<boolean> | boolean;
  size(): Promise<number> | number;
}

export class RedisCache implements CacheInterface {
  private redis: Redis | null = null;
  private fallback: MemoryCache;
  private readonly defaultTtlSeconds: number;
  private connected: boolean = false;
  private readonly keyPrefix: string;

  constructor(options: { url?: string; defaultTtlSeconds?: number; keyPrefix?: string } = {}) {
    this.defaultTtlSeconds = options.defaultTtlSeconds || config.cache.defaultTtlSeconds;
    this.keyPrefix = options.keyPrefix || config.redis.keyPrefix;
    this.fallback = new MemoryCache(this.defaultTtlSeconds);
    const redisUrl = options.url || config.redis.url;
    if (redisUrl) {
      this.initializeRedis(redisUrl);
    } else {
      logger.info('CACHE_INIT', { mode: 'memory', reason: 'No REDIS_URL configured' });
    }
  }

  private initializeRedis(url: string): void {
    try {
      this.redis = new Redis(url, {
        maxRetriesPerRequest: config.redis.maxRetries,
        retryStrategy: (times: number) => {
          if (times > config.redis.maxRetries) {
            logger.warn('REDIS_RETRY_EXHAUSTED', { times, message: 'Falling back to memory cache' });
            return null;
          }
          return Math.min(times * config.redis.retryDelayMs, config.redis.maxRetryDelayMs);
        },
        lazyConnect: true,
      });

      this.redis.on('connect', () => {
        this.connected = true;
        logger.info('REDIS_CONNECTED', { url: this.maskUrl(url) });
      });

      this.redis.on('error', (err: Error) => {
        logger.error('REDIS_ERROR', { error: err.message });
        this.connected = false;
      });

      this.redis.on('close', () => {
        this.connected = false;
        logger.warn('REDIS_DISCONNECTED');
      });

      this.redis.connect().catch((err: Error) => {
        logger.warn('REDIS_CONNECT_FAILED', { error: err.message, fallback: 'Using memory cache' });
        this.redis = null;
      });
    } catch (err) {
      logger.error('REDIS_INIT_ERROR', { error: err instanceof Error ? err.message : 'Unknown' });
      this.redis = null;
    }
  }

  private maskUrl(url: string): string {
    try {
      const parsed = new URL(url);
      if (parsed.password) parsed.password = '****';
      return parsed.toString();
    } catch {
      return '[invalid-url]';
    }
  }

  private prefixKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  async get<T>(key: string): Promise<T | null> {
    const prefixedKey = this.prefixKey(key);
    if (this.redis && this.connected) {
      try {
        const data = await this.redis.get(prefixedKey);
        if (data) {
          logger.debug('REDIS_CACHE_HIT', { key });
          return JSON.parse(data) as T;
        }
        return null;
      } catch (err) {
        logger.error('REDIS_GET_ERROR', { key, error: err instanceof Error ? err.message : 'Unknown' });
        return this.fallback.get<T>(key);
      }
    }
    return this.fallback.get<T>(key);
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const prefixedKey = this.prefixKey(key);
    const ttl = ttlSeconds || this.defaultTtlSeconds;
    const serialized = JSON.stringify(value);
    this.fallback.set(key, value, ttl);
    if (this.redis && this.connected) {
      try {
        await this.redis.setex(prefixedKey, ttl, serialized);
        logger.debug('REDIS_CACHE_SET', { key, ttl });
      } catch (err) {
        logger.error('REDIS_SET_ERROR', { key, error: err instanceof Error ? err.message : 'Unknown' });
      }
    }
  }

  async delete(key: string): Promise<boolean> {
    const prefixedKey = this.prefixKey(key);
    this.fallback.delete(key);
    if (this.redis && this.connected) {
      try {
        const result = await this.redis.del(prefixedKey);
        return result > 0;
      } catch (err) {
        logger.error('REDIS_DELETE_ERROR', { key, error: err instanceof Error ? err.message : 'Unknown' });
        return false;
      }
    }
    return true;
  }

  async clear(): Promise<void> {
    this.fallback.clear();
    if (this.redis && this.connected) {
      try {
        const keys = await this.redis.keys(`${this.keyPrefix}*`);
        if (keys.length > 0) await this.redis.del(...keys);
        logger.info('REDIS_CACHE_CLEARED', { keysDeleted: keys.length });
      } catch (err) {
        logger.error('REDIS_CLEAR_ERROR', { error: err instanceof Error ? err.message : 'Unknown' });
      }
    }
  }

  async has(key: string): Promise<boolean> {
    const prefixedKey = this.prefixKey(key);
    if (this.redis && this.connected) {
      try {
        const exists = await this.redis.exists(prefixedKey);
        return exists > 0;
      } catch {
        return this.fallback.has(key);
      }
    }
    return this.fallback.has(key);
  }

  async size(): Promise<number> {
    if (this.redis && this.connected) {
      try {
        const keys = await this.redis.keys(`${this.keyPrefix}*`);
        return keys.length;
      } catch {
        return this.fallback.size();
      }
    }
    return this.fallback.size();
  }

  isConnected(): boolean { return this.connected; }
  getMode(): 'redis' | 'memory' { return this.connected ? 'redis' : 'memory'; }

  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
      this.connected = false;
    }
  }
}

let cacheInstance: RedisCache | null = null;

export function getCache(options?: { url?: string; defaultTtlSeconds?: number; keyPrefix?: string }): RedisCache {
  if (!cacheInstance) cacheInstance = new RedisCache(options);
  return cacheInstance;
}

export { RedisCache as Cache };
