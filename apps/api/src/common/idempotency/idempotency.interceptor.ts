import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable, of } from "rxjs";
import { tap } from "rxjs/operators";
import type { AuthUser } from "@cantero/shared";
import { IdempotencyService } from "./idempotency.service";

const IDEMPOTENT_METHODS = new Set(["POST", "PUT", "PATCH"]);

/**
 * Replays the cached response for a request carrying a repeated `Idempotency-Key` header instead
 * of re-running the handler — the offline mutation queue (apps/web/lib/offline-queue.ts) sends the
 * same key on every attempt of one logical mutation, so a retry after the *response* to an
 * already-committed write was lost (a dropped connection, a backgrounded tab, ...) doesn't apply
 * that write a second time.
 *
 * Entirely inert for the vast majority of requests, which don't send the header at all — no
 * behavior change, no cost beyond one Map lookup. Only successful responses are cached (see
 * IdempotencyService.set); a failed attempt is always retried normally.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly idempotency: IdempotencyService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const key = request.headers?.["idempotency-key"];
    if (typeof key !== "string" || !key || !IDEMPOTENT_METHODS.has(request.method)) {
      return next.handle();
    }

    // Scoped per-user so one person's key can never collide with (or replay a result to) another's.
    const user = request.user as AuthUser | undefined;
    const cacheKey = `${user?.userId ?? "anon"}:${request.method}:${request.originalUrl ?? request.url}:${key}`;

    const cached = this.idempotency.get(cacheKey);
    if (cached.hit) return of(cached.result);

    return next.handle().pipe(tap((result) => this.idempotency.set(cacheKey, result)));
  }
}
