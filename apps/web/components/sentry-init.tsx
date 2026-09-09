"use client";

import { useEffect } from "react";
import { initClientSentry } from "@/lib/init-sentry";

/** Mounted once in the root layout, same pattern as PwaRegister — a no-render side-effect
 * component rather than calling initClientSentry() at module scope, so it runs after hydration
 * rather than during the server render (where NEXT_PUBLIC_SENTRY_DSN is available but there's no
 * browser to report from). Sentry's default GlobalHandlers integration covers uncaught errors and
 * unhandled promise rejections on its own; error.tsx/global-error.tsx separately report a caught
 * React render error, which Sentry can't see by itself. */
export function SentryInit() {
  useEffect(() => {
    initClientSentry();
  }, []);

  return null;
}
