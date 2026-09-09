"use client";

import * as Sentry from "@sentry/browser";

let initialized = false;

/** No-op unless NEXT_PUBLIC_SENTRY_DSN is set — same "leave it unset for local dev" convention as
 * the API's initSentry() (apps/api/src/common/sentry/init-sentry.ts). Uses @sentry/browser rather
 * than @sentry/nextjs: this app has no server-side Sentry need beyond what the API already
 * reports, so the plain browser SDK covers the actual gap (an unreported crash in the browser)
 * without the build-time instrumentation (source maps, edge/server configs) the Next-specific SDK
 * adds for cases this app doesn't have. Idempotent — safe to call from a component that could
 * re-render/remount. */
export function initClientSentry(): void {
  if (initialized) return;
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  initialized = true;
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
  });
}
