"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, downloadBlob } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format-date";

interface AuditLogEntry {
  id: string;
  actorName: string;
  summary: string;
  createdAt: string;
}

export function AuditLogPanel() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const AUDIT_PAGE_SIZE = 50;
  const [auditLog, setAuditLog] = useState<AuditLogEntry[] | null>(null);
  const [auditFilter, setAuditFilter] = useState({ dateFrom: "", dateTo: "", entityType: "", action: "" });
  const [auditExportBusy, setAuditExportBusy] = useState(false);
  const [auditHasMore, setAuditHasMore] = useState(false);
  const [auditLoadMoreBusy, setAuditLoadMoreBusy] = useState(false);

  function auditQueryString(filter: typeof auditFilter, cursor?: string): string {
    const params = new URLSearchParams();
    if (filter.dateFrom) params.set("dateFrom", new Date(filter.dateFrom).toISOString());
    if (filter.dateTo) params.set("dateTo", new Date(filter.dateTo).toISOString());
    if (filter.entityType) params.set("entityType", filter.entityType);
    if (filter.action) params.set("action", filter.action);
    if (cursor) params.set("cursor", cursor);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }

  function loadAuditLog(filter: typeof auditFilter = auditFilter) {
    apiFetch<AuditLogEntry[]>(`/company/audit-log${auditQueryString(filter)}`).then((page) => {
      setAuditLog(page);
      setAuditHasMore(page.length === AUDIT_PAGE_SIZE);
    });
  }

  async function loadMoreAuditLog() {
    if (!auditLog || auditLog.length === 0) return;
    setAuditLoadMoreBusy(true);
    try {
      const page = await apiFetch<AuditLogEntry[]>(
        `/company/audit-log${auditQueryString(auditFilter, auditLog[auditLog.length - 1].id)}`,
      );
      setAuditLog([...auditLog, ...page]);
      setAuditHasMore(page.length === AUDIT_PAGE_SIZE);
    } finally {
      setAuditLoadMoreBusy(false);
    }
  }

  useEffect(() => loadAuditLog(), []);

  async function exportAuditLog() {
    setAuditExportBusy(true);
    try {
      const blob = await apiFetch<Blob>(`/company/audit-log/export${auditQueryString(auditFilter)}`);
      downloadBlob(blob, "audit-log.csv");
    } finally {
      setAuditExportBusy(false);
    }
  }

  return (
    <section className="card lg:col-span-2">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t("auditLog")}</h2>
        <button onClick={exportAuditLog} disabled={auditExportBusy} className="btn-secondary px-2.5 py-1 text-xs">
          {t("exportCsv")}
        </button>
      </div>
      <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">{t("auditLogHint")}</p>

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
          {t("auditFilterDateFrom")}
          <input
            type="date"
            className="input"
            value={auditFilter.dateFrom}
            onChange={(e) => setAuditFilter((f) => ({ ...f, dateFrom: e.target.value }))}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
          {t("auditFilterDateTo")}
          <input
            type="date"
            className="input"
            value={auditFilter.dateTo}
            onChange={(e) => setAuditFilter((f) => ({ ...f, dateTo: e.target.value }))}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
          {t("auditFilterEntityType")}
          <input
            className="input"
            placeholder="Project"
            value={auditFilter.entityType}
            onChange={(e) => setAuditFilter((f) => ({ ...f, entityType: e.target.value }))}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
          {t("auditFilterAction")}
          <input
            className="input"
            placeholder="project.created"
            value={auditFilter.action}
            onChange={(e) => setAuditFilter((f) => ({ ...f, action: e.target.value }))}
          />
        </label>
        <button onClick={() => loadAuditLog()} className="btn-secondary px-2.5 py-1.5 text-xs">
          {t("auditFilterApply")}
        </button>
      </div>

      {!auditLog ? (
        <p className="text-gray-500 dark:text-gray-400">{tc("loading")}</p>
      ) : auditLog.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{t("noAuditLog")}</p>
      ) : (
        <>
          <ul className="flex max-h-96 flex-col gap-2 overflow-y-auto">
            {auditLog.map((entry) => (
              <li key={entry.id} className="flex items-start justify-between border-b border-gray-100 dark:border-gray-700 pb-2 text-sm">
                <div>
                  <span className="font-medium text-gray-800 dark:text-gray-100">{entry.actorName}</span>{" "}
                  <span className="text-gray-600 dark:text-gray-300">{entry.summary}</span>
                </div>
                <span className="shrink-0 pl-3 text-xs text-gray-400 dark:text-gray-500">
                  {formatDateTime(new Date(entry.createdAt))}
                </span>
              </li>
            ))}
          </ul>
          {auditHasMore && (
            <button onClick={loadMoreAuditLog} disabled={auditLoadMoreBusy} className="btn-secondary mt-3 px-2.5 py-1 text-xs">
              {t("auditLoadMore")}
            </button>
          )}
        </>
      )}
    </section>
  );
}
