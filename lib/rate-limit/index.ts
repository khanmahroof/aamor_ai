import { AppError } from "../http";
/** Single-process local limiter. Use a shared atomic store for replicas. */
export class RateLimiter {
  private buckets = new Map<string, { count: number; until: number }>();
  private active = new Map<string, number>();
  consume(key: string, limit: number, window = 60000, now = Date.now()) {
    if (this.buckets.size > 5000)
      for (const [id, bucket] of this.buckets)
        if (bucket.until <= now) this.buckets.delete(id);
    const bucket = this.buckets.get(key);
    if (bucket && bucket.until > now) {
      if (bucket.count >= limit)
        throw new AppError(
          429,
          "Too many requests. Please wait and retry.",
          Math.ceil((bucket.until - now) / 1000),
        );
      bucket.count++;
      return;
    }
    if (this.buckets.size >= 10000)
      throw new AppError(429, "Server is busy. Please retry shortly.", 60);
    this.buckets.set(key, { count: 1, until: now + window });
  }
  acquire(key: string, limit = 1) {
    const count = this.active.get(key) ?? 0;
    if (count >= limit)
      throw new AppError(
        429,
        "A response is already running. Stop it or wait.",
        2,
      );
    this.active.set(key, count + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const left = (this.active.get(key) ?? 1) - 1;
      if (left) this.active.set(key, left);
      else this.active.delete(key);
    };
  }
}
const shared = globalThis as unknown as { aamorLimiter?: RateLimiter };
export const limiter = (shared.aamorLimiter ??= new RateLimiter());
