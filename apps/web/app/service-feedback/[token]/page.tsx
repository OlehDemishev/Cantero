"use client";

import { use, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, ApiError } from "@/lib/api-client";

export default function ServiceFeedbackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const t = useTranslations("serviceFeedback");

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rating === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/service-visits/feedback/${token}`, {
        method: "POST",
        body: JSON.stringify({ rating, comment: comment || undefined }),
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("error"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-sm font-semibold text-white">
            C
          </span>
          <span className="text-lg font-semibold tracking-tight text-gray-900">Cantero</span>
        </div>

        <div className="card">
          <h1 className="text-xl font-semibold text-gray-900">{t("title")}</h1>

          {done ? (
            <p className="mt-4 text-sm text-gray-600">{t("thanks")}</p>
          ) : (
            <>
              {error && <p className="mt-4 rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700">{error}</p>}
              <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
                <div className="flex justify-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setRating(n)}
                      className={`text-3xl ${n <= rating ? "text-amber-400" : "text-gray-300"}`}
                      aria-label={t("starRating", { n })}
                    >
                      ★
                    </button>
                  ))}
                </div>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-gray-700">{t("comment")}</span>
                  <textarea className="input h-24" value={comment} onChange={(e) => setComment(e.target.value)} />
                </label>
                <button type="submit" disabled={submitting || rating === 0} className="btn-primary mt-2">
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
