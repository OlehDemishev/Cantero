"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, downloadBlob, getToken, API_URL, ApiError } from "@/lib/api-client";
import { FormError } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";

/** The page title with the CSV / QuickBooks / Xero / DATEV exports, and how the DATEV export went. */
export function InvoicesHeader() {
  const t = useTranslations("invoices");
  const tc = useTranslations("common");
  const [datevError, setDatevError] = useState<string | null>(null);
  const [datevWarningCount, setDatevWarningCount] = useState<number | null>(null);

  async function exportCsv() {
    const blob = await apiFetch<Blob>("/invoices/export.csv");
    downloadBlob(blob, "invoices.csv");
  }

  async function exportQuickBooksCsv() {
    const blob = await apiFetch<Blob>("/invoices/export/quickbooks.csv");
    downloadBlob(blob, "invoices-quickbooks.csv");
  }

  async function exportXeroCsv() {
    const blob = await apiFetch<Blob>("/invoices/export/xero.csv");
    downloadBlob(blob, "invoices-xero.csv");
  }

  async function exportDatevCsv() {
    setDatevError(null);
    setDatevWarningCount(null);
    try {
      // A raw fetch, not apiFetch — the warning count travels as a response header, which
      // apiFetch's Blob-returning path doesn't expose.
      const token = getToken();
      const res = await fetch(`${API_URL}/invoices/export/datev.csv`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new ApiError(res.status, body?.message ?? res.statusText);
      }
      const warningsCount = Number(res.headers.get("X-Datev-Warnings-Count") ?? "0");
      const blob = await res.blob();
      downloadBlob(blob, "invoices-datev.csv");
      setDatevWarningCount(warningsCount);
    } catch (err) {
      setDatevError(err instanceof ApiError ? err.message : tc("error"));
    }
  }

  return (
    <>
      <PageHeader
        title={t("title")}
        actions={
          <>
            <button onClick={exportCsv} className="btn-secondary">
              {t("exportCsv")}
            </button>
            <button onClick={exportQuickBooksCsv} className="btn-secondary">
              {t("exportQuickBooks")}
            </button>
            <button onClick={exportXeroCsv} className="btn-secondary">
              {t("exportXero")}
            </button>
            <button onClick={exportDatevCsv} className="btn-secondary">
              {t("exportDatev")}
            </button>
          </>
        }
      />
      <p className="mt-1 text-xs text-fg-subtle">{t("datevTestImportNotice")}</p>
      {datevError && <FormError className="mt-1">{datevError}</FormError>}
      {datevWarningCount !== null && datevWarningCount > 0 && (
        <p className="mt-1 text-xs text-warning-fg">{t("datevWarningCount", { count: datevWarningCount })}</p>
      )}
    </>
  );
}
