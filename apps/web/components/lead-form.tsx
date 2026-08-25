"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";

interface FormInfo {
  companyName: string;
}

export function LeadForm({ token }: { token: string }) {
  const t = useTranslations("leadForm");

  const [info, setInfo] = useState<FormInfo | null | undefined>(undefined);
  const [form, setForm] = useState({ name: "", email: "", phone: "", message: "", honeypot: "" });
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<FormInfo>(`/public/leads/${token}`)
      .then(setInfo)
      .catch(() => setInfo(null));
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/public/leads/${token}`, { method: "POST", body: JSON.stringify(form) });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("submitError"));
    } finally {
      setBusy(false);
    }
  }

  if (info === undefined) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6 py-12">
        <p className="text-sm text-gray-500">{t("loading")}</p>
      </main>
    );
  }

  if (info === null) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6 py-12">
        <p className="max-w-sm text-center text-sm text-gray-500">{t("formNotFound")}</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="card">
          <h1 className="text-xl font-semibold text-gray-900">{t("formTitle", { company: info.companyName })}</h1>
          <p className="mt-1 text-sm text-gray-500">{t("formHint")}</p>

          {submitted ? (
            <p className="mt-4 rounded-lg border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700">
              {t("thankYou")}
            </p>
          ) : (
            <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
              <input
                required
                placeholder={t("namePlaceholder")}
                className="input"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
              <input
                type="email"
                placeholder={t("emailPlaceholder")}
                className="input"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
              <input
                placeholder={t("phonePlaceholder")}
                className="input"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
              <textarea
                rows={3}
                placeholder={t("messagePlaceholder")}
                className="input"
                value={form.message}
                onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              />
              <input
                type="text"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="absolute -left-[9999px] h-0 w-0 opacity-0"
                value={form.honeypot}
                onChange={(e) => setForm((f) => ({ ...f, honeypot: e.target.value }))}
              />
              {error && <p className="text-xs text-error-600">{error}</p>}
              <button type="submit" disabled={busy} className="btn-primary">
                {t("submit")}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
