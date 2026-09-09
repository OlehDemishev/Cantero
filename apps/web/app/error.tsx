"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/browser";

/** Route-level error boundary — wraps every page/layout below the root layout (see Next's own
 * error.js docs: it does NOT cover the root layout itself, that's global-error.tsx's job). Runs
 * inside the app's normal providers (theme, i18n), but deliberately doesn't reach for translated
 * copy here — an error boundary is exactly the place a translation-loading failure could itself
 * land, so it stays on plain, dependency-free text. */
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-lg font-semibold text-gray-900 dark:text-white/90">Something went wrong</h1>
      <p className="max-w-sm text-sm text-gray-500 dark:text-gray-400">
        The page hit an unexpected error. It&apos;s been reported — try again, or reload the page if it keeps happening.
      </p>
      <button onClick={() => retry()} className="btn-primary">
        Try again
      </button>
    </div>
  );
}
