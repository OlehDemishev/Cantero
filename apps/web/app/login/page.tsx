"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, ApiError, setToken } from "@/lib/api-client";

export default function LoginPage() {
  const t = useTranslations("auth");
  const tc = useTranslations("common");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [ssoMode, setSsoMode] = useState(false);

  async function handleSsoStart(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch<{ redirectUrl: string }>("/auth/sso/start", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      window.location.href = res.redirectUrl;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("ssoError"));
      setSubmitting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch<{ accessToken: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setToken(res.accessToken);
      const me = await apiFetch<{ company: { locale: string } }>("/me");
      document.cookie = `NEXT_LOCALE=${me.company.locale};path=/;max-age=31536000`;
      // Full navigation, not router.push: the root layout reads the locale cookie
      // server-side, and the Router Cache can otherwise reuse the already-rendered
      // (pre-login, default-locale) layout on a client-side transition.
      window.location.href = "/dashboard";
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("loginError"));
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
          <h1 className="text-xl font-semibold text-gray-900">{t("loginTitle")}</h1>

          {error && <p className="mt-4 rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700">{error}</p>}

          {ssoMode ? (
            <form onSubmit={handleSsoStart} className="mt-6 flex flex-col gap-4">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-gray-700">{tc("email")}</span>
                <input
                  required
                  type="email"
                  className="input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <button type="submit" disabled={submitting} className="btn-primary mt-2">
                {submitting ? tc("loading") : t("continueWithSso")}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-gray-700">{tc("email")}</span>
                <input
                  required
                  type="email"
                  className="input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-gray-700">{t("password")}</span>
                <input
                  required
                  type="password"
                  className="input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <button type="submit" disabled={submitting} className="btn-primary mt-2">
                {submitting ? tc("loading") : t("login")}
              </button>
            </form>
          )}

          <button
            type="button"
            onClick={() => {
              setSsoMode((v) => !v);
              setError(null);
            }}
            className="mt-4 w-full text-center text-xs text-gray-500 hover:text-gray-700"
          >
            {ssoMode ? t("useSsoPasswordInstead") : t("useSsoInstead")}
          </button>
        </div>

        <p className="mt-6 text-center text-sm text-gray-600">
          {t("noAccount")}{" "}
          <a href="/signup" className="font-medium text-brand-500 hover:text-brand-600">
            {t("signup")}
          </a>
        </p>
      </div>
    </main>
  );
}
