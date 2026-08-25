"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch, ApiError } from "@/lib/api-client";

export default function ResetPasswordPage() {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password }) });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tc("error"));
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
          <h1 className="text-xl font-semibold text-gray-900">{t("resetPasswordTitle")}</h1>

          {done ? (
            <>
              <p className="mt-4 text-sm text-gray-600">{t("resetPasswordDone")}</p>
              <a href="/login" className="btn-primary mt-4 inline-block">
                {t("backToLogin")}
              </a>
            </>
          ) : !token ? (
            <p className="mt-4 text-sm text-error-700">{t("resetPasswordInvalidLink")}</p>
          ) : (
            <>
              {error && <p className="mt-4 rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700">{error}</p>}
              <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-gray-700">{t("newPassword")}</span>
                  <input
                    required
                    minLength={8}
                    type="password"
                    className="input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                <button type="submit" disabled={submitting} className="btn-primary mt-2">
                  {submitting ? tc("loading") : t("resetPassword")}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
