"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/browser";

/** Root-level error boundary — catches a crash in the root layout itself (theme/i18n providers,
 * etc.), which app/error.tsx can't reach. Per Next's own docs this replaces the entire document,
 * including <html>/<body>, and does NOT get the app's global stylesheet — inline styles only,
 * no Tailwind classes, no next-intl (its provider is exactly what could have just crashed). */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "1.5rem",
          textAlign: "center",
          fontFamily: "system-ui, -apple-system, sans-serif",
          color: "#111827",
          background: "#f9fafb",
        }}
      >
        <h1 style={{ fontSize: "1.125rem", fontWeight: 600, margin: 0 }}>Something went wrong</h1>
        <p style={{ maxWidth: "24rem", fontSize: "0.875rem", color: "#6b7280", margin: 0 }}>
          The app hit an unexpected error. It&apos;s been reported — reloading usually fixes it.
        </p>
        <button
          onClick={() => retry()}
          style={{
            padding: "0.5rem 1rem",
            borderRadius: "0.5rem",
            border: "none",
            background: "#465fff",
            color: "white",
            fontSize: "0.875rem",
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
