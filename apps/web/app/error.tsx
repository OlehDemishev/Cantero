"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import * as Sentry from "@sentry/browser";

/** Route-level error boundary — wraps every page/layout below the root layout (see Next's own
 * error.js docs: it does NOT cover the root layout itself, that's global-error.tsx's job). It
 * renders inside the root layout's providers, so the copy is translated; a crash in those
 * providers themselves (i18n included) lands in global-error.tsx instead. */
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useTranslations("appErrors");

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-lg font-semibold text-fg">{t("title")}</h1>
      <p className="max-w-sm text-sm text-fg-subtle">{t("pageBody")}</p>
      <button onClick={() => retry()} className="btn-primary">
        {t("retry")}
      </button>
    </div>
  );
}
