"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, API_URL } from "@/lib/api-client";

interface ShowcasePhoto {
  id: string;
  projectName: string | null;
}
interface FormInfo {
  companyName: string;
  brandColor: string | null;
  hasLogo: boolean;
  photos: ShowcasePhoto[];
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
    <main className="min-h-screen bg-gray-50 px-6 py-12">
      <div className="mx-auto flex max-w-3xl flex-col items-center">
        {info.hasLogo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`${API_URL}/public/leads/${token}/logo`} alt={info.companyName} className="mb-4 h-14 w-auto" />
        )}
        <h1 className="text-2xl font-semibold text-gray-900" style={info.brandColor ? { color: info.brandColor } : undefined}>
          {info.companyName}
        </h1>

        {info.photos.length > 0 && (
          <div className="mt-8 grid w-full grid-cols-2 gap-2 sm:grid-cols-3">
            {info.photos.map((photo) => (
              <div key={photo.id} className="group relative aspect-square overflow-hidden rounded-lg bg-gray-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${API_URL}/public/leads/${token}/photo/${photo.id}`}
                  alt={photo.projectName ?? info.companyName}
                  className="h-full w-full object-cover"
                />
                {photo.projectName && (
                  <span className="absolute inset-x-0 bottom-0 truncate bg-black/50 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                    {photo.projectName}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mx-auto mt-8 w-full max-w-sm">
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900">{t("formTitle", { company: info.companyName })}</h2>
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
