// src/services/cache/index.ts

import { MemoryCache } from './memory-cache.js';
import { RedisCache, getCache, type CacheInterface } from './redis-cache.js';

export { MemoryCache };
export { RedisCache, getCache };
export type { CacheInterface };

// Legacy export for backward compatibility
export const memoryCache = new MemoryCache();

// Main cache - uses Redis if REDIS_URL is set, otherwise falls back to memory
export const cache = getCache();