import * as Sentry from "@sentry/node";

/** No-op unless SENTRY_DSN is set — same "leave it unset for local dev" convention as
 * MailService/SmsService/StorageService. Must run before anything else in bootstrap() so Sentry's
 * instrumentation can hook the modules it needs (http, the DB driver, ...) before they load. */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
  });
}
