"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";

export function LeadFormSettingsPanel({ token, canManage, onChange }: { token: string | null; canManage: boolean; onChange: () => void }) {
  const t = useTranslations("leadForm");
  const tc = useTranslations("common");

  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const url = token ? `${typeof window !== "undefined" ? window.location.origin : ""}/lead/${token}` : null;

  async function regenerate() {
    setBusy(true);
    try {
      await apiFetch("/company/lead-form/regenerate", { method: "POST" });
      onChange();
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      await apiFetch("/company/lead-form", { method: "DELETE" });
      onChange();
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="card lg:col-span-2">
      <h2 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("title")}</h2>
      <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">{t("hint")}</p>

      {url ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <input readOnly className="input flex-1 text-xs" value={url} />
            <button onClick={copyLink} className="btn-secondary shrink-0 px-3 py-1 text-xs">
              {copied ? tc("saved") : t("copyLink")}
            </button>
          </div>
          {canManage && (
            <div className="flex gap-2">
              <button onClick={regenerate} disabled={busy} className="btn-secondary px-3 py-1 text-xs">
                {t("regenerateLink")}
              </button>
              <button onClick={disable} disabled={busy} className="btn-secondary px-3 py-1 text-xs text-error-600">
                {t("disableForm")}
              </button>
            </div>
          )}
        </div>
      ) : (
        canManage && (
          <button onClick={regenerate} disabled={busy} className="btn-primary">
            {t("enableForm")}
          </button>
        )
      )}
      {!canManage && !url && <p className="text-sm text-gray-400 dark:text-gray-500">{t("notEnabled")}</p>}
    </section>
  );
}
