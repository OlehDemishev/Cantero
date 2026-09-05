"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format-date";

interface SignIn {
  id: string;
  name: string;
  visitorCompany: string | null;
  purpose: string | null;
  signedInAt: string;
  signedOutAt: string | null;
}

export function SiteSignInsPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("siteSignIns");
  const [signIns, setSignIns] = useState<SignIn[] | null>(null);
  const [form, setForm] = useState({ name: "", visitorCompany: "", purpose: "" });
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<SignIn[]>(`/projects/${projectId}/site-sign-ins`).then(setSignIns);
  }

  useEffect(load, [projectId]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/projects/${projectId}/site-sign-ins`, {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          visitorCompany: form.visitorCompany || undefined,
          purpose: form.purpose || undefined,
        }),
      });
      setForm({ name: "", visitorCompany: "", purpose: "" });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function signOut(id: string) {
    await apiFetch(`/projects/${projectId}/site-sign-ins/${id}/sign-out`, { method: "POST" });
    load();
  }

  const onSite = signIns?.filter((s) => !s.signedOutAt) ?? [];
  const departed = signIns?.filter((s) => s.signedOutAt) ?? [];

  return (
    <div className="mt-8">
      <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("title")}</h2>
      <div className="card">
        <form onSubmit={signIn} className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            {t("name")}
            <input className="input py-1 text-xs" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            {t("visitorCompany")}
            <input
              className="input py-1 text-xs"
              value={form.visitorCompany}
              onChange={(e) => setForm((f) => ({ ...f, visitorCompany: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            {t("purpose")}
            <input className="input py-1 text-xs" value={form.purpose} onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))} />
          </label>
          <button type="submit" disabled={busy || !form.name.trim()} className="btn-primary px-3 py-1.5 text-xs">
            {t("signIn")}
          </button>
        </form>

        {onSite.length > 0 && (
          <div className="mt-4 border-t border-gray-100 pt-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{t("onSite", { count: onSite.length })}</h3>
            <ul className="flex flex-col gap-1.5">
              {onSite.map((s) => (
                <li key={s.id} className="flex items-center justify-between text-sm">
                  <span>
                    {s.name}
                    {s.visitorCompany && <span className="text-gray-400"> — {s.visitorCompany}</span>}
                    {s.purpose && <span className="ml-1 text-xs text-gray-400">({s.purpose})</span>}
                  </span>
                  <button onClick={() => signOut(s.id)} className="text-xs text-brand-700 hover:underline">
                    {t("signOut")}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {departed.length > 0 && (
          <div className="mt-4 border-t border-gray-100 pt-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{t("history")}</h3>
            <ul className="flex flex-col gap-1 text-xs text-gray-500">
              {departed.slice(0, 10).map((s) => (
                <li key={s.id}>
                  {s.name}
                  {s.visitorCompany && ` — ${s.visitorCompany}`}: {formatDateTime(new Date(s.signedInAt))} →{" "}
                  {s.signedOutAt && formatDateTime(new Date(s.signedOutAt))}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
