"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useConfirm } from "@/components/ui/confirm-dialog";

export function LeadFormSettingsPanel({ token, canManage, onChange }: { token: string | null; canManage: boolean; onChange: () => void }) {
  const t = useTranslations("leadForm");
  const confirm = useConfirm();
  const td = useTranslations("dialog");
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
    if (!(await confirm({ message: td("disableLeadForm"), tone: "danger", verb: "disable" }))) return;
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
      <h2 className="mb-1 text-sm font-semibold text-fg-muted">{t("title")}</h2>
      <p className="mb-4 text-xs text-fg-subtle">{t("hint")}</p>

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
              <button onClick={disable} disabled={busy} className="btn-secondary px-3 py-1 text-xs text-danger-fg">
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
      {!canManage && !url && <p className="text-sm text-fg-subtle">{t("notEnabled")}</p>}
    </section>
  );
}
