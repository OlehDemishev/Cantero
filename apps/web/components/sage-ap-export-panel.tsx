"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, downloadBlob } from "@/lib/api-client";

/** AP invoice export for Sage 300 CRE's "Import Invoices" — see sage-300-cre.ts for what the file
 * contains and what it leaves blank. The API refuses with a per-bill list when a supplier still
 * has no Sage Vendor ID, so that message is shown as-is. */
export function SageApExportPanel() {
  const t = useTranslations("sageExport");
  const [expenseAccount, setExpenseAccount] = useState("");
  const [apAccount, setApAccount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function exportFile() {
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (expenseAccount.trim()) params.set("expenseAccount", expenseAccount.trim());
      if (apAccount.trim()) params.set("apAccount", apAccount.trim());
      const blob = await apiFetch<Blob>(`/materials/vendor-bills/export/sage-300-cre.txt?${params.toString()}`);
      downloadBlob(blob, "ap-invoices-sage-300-cre.txt");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card mb-4">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t("title")}</h3>
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{t("hint")}</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
          {t("expenseAccount")}
          <input className="input" value={expenseAccount} onChange={(e) => setExpenseAccount(e.target.value)} placeholder="50-1000" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
          {t("apAccount")}
          <input className="input" value={apAccount} onChange={(e) => setApAccount(e.target.value)} placeholder="20-1000" />
        </label>
        <button onClick={exportFile} disabled={busy} className="btn-secondary px-2.5 py-1.5 text-xs">
          {t("export")}
        </button>
      </div>
      {error && <p className="mt-2 whitespace-pre-line text-xs text-error-600">{error}</p>}
    </div>
  );
}
