export class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  constructor(private capacity: number, private refillPerSecond: number) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  async take(count = 1) {
    while (true) {
      this.refill();
      if (this.tokens >= count) {
        this.tokens -= count;
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  private refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    if (elapsed <= 0) return;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerSecond);
    this.lastRefill = now;
  }
}
