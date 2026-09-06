import { Injectable, HttpException, HttpStatus, OnModuleDestroy } from "@nestjs/common";

interface Bucket {
  count: number;
  resetAt: number;
}

const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * A tiny in-memory fixed-window rate limiter for brute-force-prone endpoints (login, 2FA,
 * password reset, kiosk PIN) that had no protection at all — see the security audit that added
 * this. In-memory means the counters are per-process: fine for a single-instance deployment, but
 * a multi-instance/horizontally-scaled deployment would need a shared store (Redis) instead, since
 * each instance would otherwise track attempts independently and an attacker could get `limit`
 * attempts per instance rather than in total.
 *
 * Deliberately not built on @nestjs/throttler: that library's ThrottlerGuard ties one tracking
 * key (e.g. IP) to a whole guard instance, but callers here need two independent dimensions at
 * once (e.g. per-IP AND per-account for login) with different limits — simplest to express as two
 * plain `consume()` calls than to fight the guard's per-class tracker model.
 */
@Injectable()
export class RateLimiterService implements OnModuleDestroy {
  private readonly buckets = new Map<string, Bucket>();
  private readonly sweepTimer: NodeJS.Timeout;

  constructor() {
    this.sweepTimer = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
    this.sweepTimer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.sweepTimer);
  }

  /** Throws a 429 if `key` has already made `limit` attempts within the last `windowMs`;
   * otherwise records this attempt and lets it through. Call `reset(key)` on a successful
   * attempt so a legitimate user isn't penalized by their own earlier mistakes. */
  consume(key: string, limit: number, windowMs: number): void {
    const now = Date.now();
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }
    if (bucket.count >= limit) {
      throw new HttpException("Too many attempts — please try again later", HttpStatus.TOO_MANY_REQUESTS);
    }
    bucket.count++;
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }

  private sweep(): void {
    const now = Date.now();
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}
