import { Injectable, OnModuleDestroy } from "@nestjs/common";

interface CachedEntry {
  result: unknown;
  expiresAt: number;
}

const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const ENTRY_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Backs IdempotencyInterceptor's dedup of a request replayed with the same Idempotency-Key —
 * same in-memory, per-process pattern as RateLimiterService (see that class for the tradeoff:
 * fine for a single instance, needs a shared store like Redis once horizontally scaled).
 *
 * Only ever asked about a request that actually carried the header, so this stays entirely inert
 * for the overwhelming majority of traffic that doesn't use it.
 */
@Injectable()
export class IdempotencyService implements OnModuleDestroy {
  private readonly entries = new Map<string, CachedEntry>();
  private readonly sweepTimer: NodeJS.Timeout;

  constructor() {
    this.sweepTimer = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
    this.sweepTimer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.sweepTimer);
  }

  /** The cached result of a previous successful request with this key, if any and not expired. */
  get(key: string): { hit: true; result: unknown } | { hit: false } {
    const entry = this.entries.get(key);
    if (!entry || entry.expiresAt <= Date.now()) return { hit: false };
    return { hit: true, result: entry.result };
  }

  /** Stores a successful response for future replays of this same key. Only successful outcomes
   * are cached — a failed attempt (validation error, conflict, ...) hasn't done anything final, so
   * it should be retryable normally rather than replaying the same failure forever. */
  set(key: string, result: unknown): void {
    this.entries.set(key, { result, expiresAt: Date.now() + ENTRY_TTL_MS });
  }

  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
  }
}
