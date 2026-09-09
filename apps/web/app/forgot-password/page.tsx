"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, ApiError } from "@/lib/api-client";

export default function ForgotPasswordPage() {
  const t = useTranslations("auth");
  const tc = useTranslations("common");

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tc("error"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-700 px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-sm font-semibold text-white">
            C
          </span>
          <span className="text-lg font-semibold tracking-tight text-gray-900 dark:text-gray-50">Cantero</span>
        </div>

        <div className="card">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-50">{t("forgotPasswordTitle")}</h1>

          {sent ? (
            <p className="mt-4 text-sm text-gray-600 dark:text-gray-300">{t("forgotPasswordSent")}</p>
          ) : (
            <>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{t("forgotPasswordHint")}</p>
              {error && <p className="mt-4 rounded-lg bg-error-50 dark:bg-error-500/15 px-3 py-2 text-sm text-error-700 dark:text-error-500">{error}</p>}
              <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-gray-700 dark:text-gray-200">{tc("email")}</span>
                  <input required type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
                </label>
                <button type="submit" disabled={submitting} className="btn-primary mt-2">
                  {submitting ? tc("loading") : t("sendResetLink")}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-gray-600 dark:text-gray-300">
          <a href="/login" className="font-medium text-brand-500 dark:text-brand-400 hover:text-brand-600">
            {t("backToLogin")}
          </a>
        </p>
      </div>
    </main>
  );
}
