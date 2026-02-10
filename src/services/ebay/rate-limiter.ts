import Bottleneck from 'bottleneck';
import pino from 'pino';

const logger = pino({ name: 'ebay-rate-limiter' });

const ebayLimiter = new Bottleneck({
  maxConcurrent: 5,
  minTime: 200, // 5 req/sec — conservative for eBay
});

export function scheduleEbayCall<T>(fn: () => Promise<T>): Promise<T> {
  return ebayLimiter.schedule(fn);
}

export function checkRateLimitHeaders(headers: Headers): void {
  const limit = headers.get('X-RateLimit-Limit');
  const remaining = headers.get('X-RateLimit-Remaining');
  const reset = headers.get('X-RateLimit-Reset');

  if (remaining !== null) {
    const remainingNum = parseInt(remaining, 10);
    if (remainingNum < 10) {
      logger.warn(
        { limit, remaining: remainingNum, reset },
        'eBay rate limit running low',
      );
    }
  }
}
