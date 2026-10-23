"use client";

import { use, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, ApiError } from "@/lib/api-client";
import { PublicLinkError, PublicNotice } from "@/components/public-link-error";
import { useCompanyLocale } from "@/components/public-locale";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";

/** GET of the same token: whose form it is, in which language, and whether it is still open. */
interface FormLink {
  companyName: string;
  locale: string;
  submitted: boolean;
}

const SCORES = Array.from({ length: 11 }, (_, i) => i);

export default function EnpsSurveyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const t = useTranslations("enpsSurvey");

  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const tp = useTranslations("publicLink");
  const [link, setLink] = useState<FormLink | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  useCompanyLocale(link?.locale);

  // Check the link before showing the form, so a wrong or used one says so up front rather
  // than after the person has filled it in.
  useEffect(() => {
    apiFetch<FormLink>(`/enps-surveys/${token}`).then(setLink).catch(setLoadError);
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (score === null) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/enps-surveys/${token}`, {
        method: "POST",
        body: JSON.stringify({ score, comment: comment || undefined }),
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("error"));
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) return <PublicLinkError error={loadError} />;
  if (!link) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface-muted px-6 py-12">
        <p className="text-sm text-fg-subtle">{tp("loading")}</p>
      </main>
    );
  }
  if (link.submitted && !done) return <PublicNotice title={tp("alreadySubmittedTitle")} body={tp("alreadySubmittedBody")} />;

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-700 px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-sm font-semibold text-white">
            C
          </span>
          <span className="text-lg font-semibold tracking-tight text-fg">Cantero</span>
        </div>

        <div className="card">
          <h1 className="text-xl font-semibold text-fg">{t("title")}</h1>
          <p className="mt-1 text-xs text-fg-subtle">{t("anonymousNote")}</p>

          {done ? (
            <p className="mt-4 text-sm text-gray-600 dark:text-gray-300">{t("thanks")}</p>
          ) : (
            <>
              {error && <Alert tone="danger" className="mt-4">{error}</Alert>}
              <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
                <div>
                  <div className="grid grid-cols-11 gap-1">
                    {SCORES.map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setScore(n)}
                        className={`flex h-8 items-center justify-center rounded-md text-xs font-medium ${
                          n === score ? "bg-brand-500 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200"
                        }`}
                        aria-label={t("scoreLabel", { n })}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-fg-subtle">
                    <span>{t("notLikely")}</span>
                    <span>{t("veryLikely")}</span>
                  </div>
                </div>
                <Field label={t("comment")}>
                  <textarea className="input h-24" value={comment} onChange={(e) => setComment(e.target.value)} />
                </Field>
                <button type="submit" disabled={submitting || score === null} className="btn-primary mt-2">
                  {t("submit")}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
