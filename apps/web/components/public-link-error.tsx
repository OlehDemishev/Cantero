"use client";

import { useTranslations } from "next-intl";
import { ApiError } from "@/lib/api-client";

/** The Cantero mark public pages show above their card. */
export function PublicBrand() {
  return (
    <div className="mb-8 flex items-center justify-center gap-2">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-sm font-semibold text-white">C</span>
      <span className="text-lg font-semibold tracking-tight text-fg">Cantero</span>
    </div>
  );
}

/** A full-page branded message for a public link: a title, a sentence, and optionally a button. */
export function PublicNotice({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-muted px-6 py-12">
      <div className="w-full max-w-sm text-center">
        <PublicBrand />
        <div className="card" role="status">
          <h1 className="text-lg font-semibold text-fg">{title}</h1>
          <p className="mt-2 text-sm text-fg-subtle">{body}</p>
          {action && <div className="mt-4">{action}</div>}
        </div>
      </div>
    </main>
  );
}

/**
 * What a public token page (estimate, contract, signature, survey, portal sign-in link…) shows
 * when its link can't be loaded, instead of the API's bare English text ("Signing link not
 * found", "Bad Request"): a 4xx means the link is wrong, used up or withdrawn; anything else
 * (offline, server error) offers a retry.
 */
export function PublicLinkError({ error, action }: { error: unknown; action?: React.ReactNode }) {
  const t = useTranslations("publicLink");
  const linkProblem = error instanceof ApiError && error.status >= 400 && error.status < 500;
  if (linkProblem) return <PublicNotice title={t("invalidTitle")} body={t("invalidBody")} action={action} />;
  return (
    <PublicNotice
      title={t("loadFailedTitle")}
      body={t("loadFailedBody")}
      action={
        <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
          {t("retry")}
        </button>
      }
    />
  );
}
