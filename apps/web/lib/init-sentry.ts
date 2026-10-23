"use client";

import * as Sentry from "@sentry/browser";

/**
 * Routes whose next path segment is a bearer credential: the web's public token pages and the API
 * paths they call. Anyone holding one of these URLs can sign, answer or view as the recipient, so
 * they must not reach Sentry in breadcrumbs (navigation, fetch/xhr) or an event's request URL.
 */
const TOKEN_SEGMENT =
  /(\/(?:sign|survey|enps-survey|service-feedback|subcontractor-profile|lead|contract|estimate|change-order|accept-invite|company-coi|nps-surveys|enps-surveys|invites|service-visits\/feedback|public\/[^/?#\s]+)\/)[^/?#\s]+/g;
/** Query parameters that carry one: magic links, reset links, the SSO code. */
const TOKEN_QUERY = /([?&](?:token|code|access_token|accessToken)=)[^&#\s]*/gi;

export function redactTokens(text: string): string {
  return text.replace(TOKEN_SEGMENT, "$1[redacted]").replace(TOKEN_QUERY, "$1[redacted]");
}

function redactValue(value: unknown): unknown {
  return typeof value === "string" ? redactTokens(value) : value;
}

export function redactBreadcrumb(breadcrumb: Sentry.Breadcrumb): Sentry.Breadcrumb {
  if (breadcrumb.message) breadcrumb.message = redactTokens(breadcrumb.message);
  if (breadcrumb.data) {
    for (const key of ["url", "from", "to"]) {
      if (key in breadcrumb.data) breadcrumb.data[key] = redactValue(breadcrumb.data[key]);
    }
  }
  return breadcrumb;
}

export function redactEvent<T extends Sentry.Event>(event: T): T {
  if (event.request?.url) event.request.url = redactTokens(event.request.url);
  if (event.request?.query_string && typeof event.request.query_string === "string") {
    event.request.query_string = redactTokens(`?${event.request.query_string}`).slice(1);
  }
  const headers = event.request?.headers;
  if (headers) {
    for (const key of Object.keys(headers)) headers[key] = redactTokens(headers[key]);
  }
  if (event.message) event.message = redactTokens(event.message);
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = redactTokens(exception.value);
  }
  event.breadcrumbs = event.breadcrumbs?.map(redactBreadcrumb);
  return event;
}

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
    beforeBreadcrumb: redactBreadcrumb,
    beforeSend: redactEvent,
    beforeSendTransaction: redactEvent,
  });
}
