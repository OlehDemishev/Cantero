"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ApiError } from "@/lib/api-client";

type ErrorKind = "notFound" | "forbidden" | "offline" | "generic";

/** What went wrong, from an error apiFetch/useApi gave us: a 404, a 403, no connection, or anything else. */
export function errorKind(error: unknown): ErrorKind {
  if (error instanceof ApiError) {
    if (error.status === 404) return "notFound";
    if (error.status === 403) return "forbidden";
    return "generic";
  }
  // apiFetch turns a failed fetch() into a NetworkError, which is a TypeError (see lib/api-client.ts).
  if (error instanceof TypeError) return "offline";
  return "generic";
}

interface ErrorStateProps {
  error: unknown;
  /** Offered for errors that may go away on a second try (not for 404/403). */
  onRetry?: () => void;
  /** Where "Go back" leads after a 404 — the list the record came from. Without it the button goes
   * back in history. */
  backHref?: string;
  /** One line for a panel or widget, instead of the centred page-level card. */
  compact?: boolean;
  className?: string;
}

/**
 * Says why something couldn't be loaded, in the viewer's language: a record that doesn't exist (with
 * a way back), no access for this role, no connection, or another failure (with "Try again").
 */
export function ErrorState({ error, onRetry, backHref, compact = false, className = "" }: ErrorStateProps) {
  const t = useTranslations("loadState");
  const router = useRouter();
  const kind = errorKind(error);
  const title = t(kind === "notFound" ? "notFoundTitle" : kind === "forbidden" ? "forbiddenTitle" : kind === "offline" ? "offlineTitle" : "errorTitle");
  const body =
    kind === "notFound"
      ? t("notFoundBody")
      : kind === "forbidden"
        ? t("forbiddenBody")
        : kind === "offline"
          ? t("offlineBody")
          : error instanceof Error && error.message
            ? error.message
            : null;
  const retry = onRetry && (kind === "offline" || kind === "generic");

  if (compact) {
    return (
      <p role="alert" className={`text-sm text-fg-subtle ${className}`}>
        <span className={kind === "forbidden" || kind === "notFound" ? "" : "text-danger-fg"}>{title}</span>
        {kind !== "forbidden" && body && <span>. {body}</span>}
        {retry && (
          <>
            {" "}
            <button type="button" onClick={onRetry} className="font-medium text-brand-700 hover:underline dark:text-brand-400">
              {t("retry")}
            </button>
          </>
        )}
      </p>
    );
  }

  return (
    <div role="alert" className={`flex flex-col items-center gap-2 px-4 py-10 text-center ${className}`}>
      <p className="text-base font-semibold text-fg">{title}</p>
      {body && <p className="max-w-md text-sm text-fg-subtle">{body}</p>}
      <div className="mt-2 flex gap-2">
        {retry && (
          <button type="button" onClick={onRetry} className="btn-primary">
            {t("retry")}
          </button>
        )}
        {kind === "notFound" &&
          (backHref ? (
            <Link href={backHref} className="btn-secondary">
              {t("back")}
            </Link>
          ) : (
            <button type="button" onClick={() => router.back()} className="btn-secondary">
              {t("back")}
            </button>
          ))}
      </div>
    </div>
  );
}

/**
 * A panel that couldn't load: its heading, then a one-line ErrorState. For report and dashboard
 * widgets that otherwise stay hidden while loading or when they have nothing to show.
 */
export function PanelErrorState({ title, error, onRetry, className = "mt-10" }: { title: string; error: unknown; onRetry?: () => void; className?: string }) {
  return (
    <div className={className}>
      <h2 className="mb-1 text-sm font-semibold text-fg-muted">{title}</h2>
      <ErrorState error={error} onRetry={onRetry} compact />
    </div>
  );
}
