"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, downloadBlob } from "@/lib/api-client";
import { formatDate } from "@/lib/format-date";
import { useConfirm } from "@/components/ui/confirm-dialog";

interface Company {
  deletionRequestedAt: string | null;
}

/** Exporting the data needs settings.export; asking to delete the company stays with owner and admin. */
export function DataPrivacyPanel({ canExport, canDelete }: { canExport: boolean; canDelete: boolean }) {
  const t = useTranslations("dataPrivacy");
  const confirm = useConfirm();

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
    if (!(await confirm({ message: t("confirmRequest"), tone: "danger", verb: "request" }))) return;
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

  if (!company || (!canExport && !canDelete)) return null;

  return (
    <section className="card lg:col-span-2">
      <h2 className="mb-1 text-sm font-semibold text-fg-muted">{t("title")}</h2>
      <p className="mb-4 text-xs text-fg-subtle">{t("hint")}</p>

      <div className="flex flex-col gap-4">
        {canExport && (
        <>
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t("exportTitle")}</h3>
          <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">{t("exportHint")}</p>
          <button onClick={exportData} disabled={exporting} className="btn-secondary px-3 py-1 text-xs">
            {exporting ? t("exporting") : t("exportButton")}
          </button>
        </div>

        <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t("operationalExportTitle")}</h3>
          <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">{t("operationalExportHint")}</p>
          <button onClick={exportOperationalData} disabled={exportingOperational} className="btn-secondary px-3 py-1 text-xs">
            {exportingOperational ? t("exporting") : t("operationalExportButton")}
          </button>
        </div>
        </>
        )}

        {canDelete && (
        <div className={canExport ? "border-t border-gray-100 dark:border-gray-700 pt-4" : ""}>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t("deletionTitle")}</h3>
          {company.deletionRequestedAt ? (
              <>
                <p className="mb-2 text-sm text-danger-fg">
                  {t("deletionPending", { date: formatDate(new Date(company.deletionRequestedAt)) })}
                </p>
                <button onClick={cancelRequest} disabled={busy} className="btn-secondary px-3 py-1 text-xs">
                  {t("cancelRequest")}
                </button>
              </>
            ) : (
              <>
                <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">{t("deletionHint")}</p>
                <button onClick={requestDeletion} disabled={busy} className="btn-secondary px-3 py-1 text-xs text-danger-fg">
                  {t("requestDeletion")}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
