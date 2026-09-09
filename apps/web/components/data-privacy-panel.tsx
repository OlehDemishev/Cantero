"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, downloadBlob } from "@/lib/api-client";
import { formatDate } from "@/lib/format-date";

interface Company {
  deletionRequestedAt: string | null;
}

export function DataPrivacyPanel({ canManage }: { canManage: boolean }) {
  const t = useTranslations("dataPrivacy");

  const [company, setCompany] = useState<Company | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportingOperational, setExportingOperational] = useState(false);
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<Company>("/company").then(setCompany);
  }

  useEffect(load, []);

  async function exportData() {
    setExporting(true);
    try {
      const blob = await apiFetch<Blob>("/company/data-export");
      downloadBlob(blob, "cantero-data-export.zip");
    } finally {
      setExporting(false);
    }
  }

  async function exportOperationalData() {
    setExportingOperational(true);
    try {
      const blob = await apiFetch<Blob>("/company/operational-export");
      downloadBlob(blob, "cantero-operational-export.zip");
    } finally {
      setExportingOperational(false);
    }
  }

  async function requestDeletion() {
    if (!window.confirm(t("confirmRequest"))) return;
    setBusy(true);
    try {
      await apiFetch("/company/deletion-request", { method: "POST" });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function cancelRequest() {
    setBusy(true);
    try {
      await apiFetch("/company/deletion-request", { method: "DELETE" });
      load();
    } finally {
      setBusy(false);
    }
  }

  if (!company || !canManage) return null;

  return (
    <section className="card lg:col-span-2">
      <h2 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("title")}</h2>
      <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">{t("hint")}</p>

      <div className="flex flex-col gap-4">
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t("exportTitle")}</h3>
          <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">{t("exportHint")}</p>
          <button onClick={exportData} disabled={exporting} className="btn-secondary px-3 py-1 text-xs">
            {exporting ? t("exporting") : t("exportButton")}
          </button>
        </div>

        <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t("operationalExportTitle")}</h3>
          <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">{t("operationalExportHint")}</p>
          <button onClick={exportOperationalData} disabled={exportingOperational} className="btn-secondary px-3 py-1 text-xs">
            {exportingOperational ? t("exporting") : t("operationalExportButton")}
          </button>
        </div>

        <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t("deletionTitle")}</h3>
          {company.deletionRequestedAt ? (
              <>
                <p className="mb-2 text-sm text-error-700 dark:text-error-500">
                  {t("deletionPending", { date: formatDate(new Date(company.deletionRequestedAt)) })}
                </p>
                <button onClick={cancelRequest} disabled={busy} className="btn-secondary px-3 py-1 text-xs">
                  {t("cancelRequest")}
                </button>
              </>
            ) : (
              <>
                <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">{t("deletionHint")}</p>
                <button onClick={requestDeletion} disabled={busy} className="btn-secondary px-3 py-1 text-xs text-error-600">
                  {t("requestDeletion")}
                </button>
              </>
            )}
          </div>
      </div>
    </section>
  );
}
