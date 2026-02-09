// src/services/cache/memory-cache.ts

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class MemoryCache {
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private readonly defaultTtlMs: number;

  constructor(defaultTtlSeconds: number = 3600) {
    this.defaultTtlMs = defaultTtlSeconds * 1000;
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlSeconds?: number): void {
    const ttlMs = ttlSeconds ? ttlSeconds * 1000 : this.defaultTtlMs;
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  size(): number {
    this.prune();
    return this.cache.size;
  }

  private prune(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }
}