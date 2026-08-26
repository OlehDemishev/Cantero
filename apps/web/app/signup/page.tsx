"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { PLAN_IDS, SUPPORTED_CURRENCIES, SUPPORTED_LOCALES, UNIT_SYSTEMS } from "@cantero/shared";
import { apiFetch, ApiError, setToken } from "@/lib/api-client";

export default function SignupPage() {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const searchParams = useSearchParams();
  const referralCode = searchParams.get("ref") ?? undefined;

  const [form, setForm] = useState({
    companyName: "",
    name: "",
    email: "",
    password: "",
    country: "DE",
    unitSystem: "metric",
    currency: "EUR",
    locale: "en",
    planCode: "starter",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch<{ accessToken: string }>("/auth/signup", {
        method: "POST",
        body: JSON.stringify({ ...form, referralCode }),
      });
      setToken(res.accessToken);
      document.cookie = `NEXT_LOCALE=${form.locale};path=/;max-age=31536000`;
      // Full navigation so the root layout re-reads the locale cookie server-side.
      window.location.href = "/billing/pending";
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("signupError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-sm font-semibold text-white">
            C
          </span>
          <span className="text-lg font-semibold tracking-tight text-gray-900">Cantero</span>
        </div>

        <div className="card">
          <h1 className="text-xl font-semibold text-gray-900">{t("signupTitle")}</h1>
          <p className="mt-1 text-sm text-gray-600">{t("signupSubtitle")}</p>

          {error && <p className="mt-4 rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700">{error}</p>}

          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <Field label={t("companyName")}>
          <input
            required
            className="input"
            value={form.companyName}
            onChange={(e) => update("companyName", e.target.value)}
          />
        </Field>
        <Field label={t("yourName")}>
          <input required className="input" value={form.name} onChange={(e) => update("name", e.target.value)} />
        </Field>
        <Field label={tc("email")}>
          <input
            required
            type="email"
            className="input"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
          />
        </Field>
        <Field label={t("password")}>
          <input
            required
            type="password"
            minLength={8}
            className="input"
            value={form.password}
            onChange={(e) => update("password", e.target.value)}
          />
        </Field>
        <Field label={t("country")}>
          <input
            required
            maxLength={2}
            className="input uppercase"
            value={form.country}
            onChange={(e) => update("country", e.target.value.toUpperCase())}
          />
        </Field>
        <Field label={t("unitSystem")}>
          <select className="input" value={form.unitSystem} onChange={(e) => update("unitSystem", e.target.value)}>
            {UNIT_SYSTEMS.map((u) => (
              <option key={u} value={u}>
                {t(u)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={tc("currency")}>
          <select className="input" value={form.currency} onChange={(e) => update("currency", e.target.value)}>
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("locale")}>
          <select className="input" value={form.locale} onChange={(e) => update("locale", e.target.value)}>
            {SUPPORTED_LOCALES.map((l) => (
              <option key={l} value={l}>
                {l.toUpperCase()}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("plan")}>
          <select className="input" value={form.planCode} onChange={(e) => update("planCode", e.target.value)}>
            {PLAN_IDS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>

        <button type="submit" disabled={submitting} className="btn-primary mt-2">
              {submitting ? tc("loading") : t("signup")}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-gray-600">
          {t("haveAccount")}{" "}
          <a href="/login" className="font-medium text-brand-500 hover:text-brand-600">
            {t("login")}
          </a>
        </p>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-gray-700">{label}</span>
      {children}
    </label>
  );
}
