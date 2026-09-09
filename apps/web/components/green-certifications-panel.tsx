"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { GREEN_CERTIFICATION_TYPES, type GreenCertificationType } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";
import { formatDate } from "@/lib/format-date";

interface GreenCertification {
  id: string;
  type: GreenCertificationType;
  name: string;
  issuedAt: string | null;
  expiresAt: string | null;
  notes: string | null;
}

const EMPTY_FORM = { type: "leed_gold" as GreenCertificationType, name: "", issuedAt: "", expiresAt: "", notes: "" };

export function GreenCertificationsPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("sustainability");
  const tc = useTranslations("common");

  const [items, setItems] = useState<GreenCertification[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<GreenCertification[]>(`/sustainability/certifications?projectId=${projectId}`).then(setItems);
  }

  useEffect(load, [projectId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch("/sustainability/certifications", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          type: form.type,
          name: form.name,
          issuedAt: form.issuedAt ? new Date(form.issuedAt).toISOString() : undefined,
          expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined,
          notes: form.notes || undefined,
        }),
      });
      setForm(EMPTY_FORM);
      setCreating(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await apiFetch(`/sustainability/certifications/${id}`, { method: "DELETE" });
    load();
  }

  if (items === null) return null;
  if (items.length === 0 && !creating) {
    return (
      <div className="mt-8">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t("certifications")}</h2>
          <button onClick={() => setCreating(true)} className="btn-secondary px-3 py-1 text-xs">
            {t("newCertification")}
          </button>
        </div>
        <p className="text-sm text-gray-400 dark:text-gray-500">{t("noCertifications")}</p>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t("certifications")}</h2>
        {!creating && (
          <button onClick={() => setCreating(true)} className="btn-secondary px-3 py-1 text-xs">
            {t("newCertification")}
          </button>
        )}
      </div>

      {creating && (
        <form onSubmit={submit} className="card mb-4 flex flex-col gap-3">
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-200">{t("certificationType")}</span>
              <select className="input" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as GreenCertificationType }))}>
                {GREEN_CERTIFICATION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`certType_${type}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-200">{tc("name")}</span>
              <input required className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-200">{t("issuedAt")}</span>
              <input type="date" className="input" value={form.issuedAt} onChange={(e) => setForm((f) => ({ ...f, issuedAt: e.target.value }))} />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-200">{t("expiresAt")}</span>
              <input type="date" className="input" value={form.expiresAt} onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))} />
            </label>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="btn-primary">
              {tc("save")}
            </button>
            <button type="button" onClick={() => setCreating(false)} className="btn-secondary">
              {tc("cancel")}
            </button>
          </div>
        </form>
      )}

      {items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="card flex items-center justify-between">
              <div>
                <span className="rounded-full bg-success-50 dark:bg-success-500/15 px-2 py-0.5 text-xs font-medium text-success-700 dark:text-success-500">{t(`certType_${item.type}`)}</span>
                <span className="ml-2 text-sm font-medium text-gray-800 dark:text-white/90">{item.name}</span>
                {item.expiresAt && <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">{t("expires", { date: formatDate(new Date(item.expiresAt)) })}</span>}
              </div>
              <button onClick={() => remove(item.id)} className="text-xs text-error-600 hover:underline">
                {tc("delete")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
