"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { REPORT_DATASETS, type ReportDataset } from "@cantero/shared";
import { apiFetch, downloadBlob } from "@/lib/api-client";

interface ReportField {
  key: string;
  label: string;
}

/** Mirrors apps/api/src/reports/report-datasets.ts — static metadata, kept in sync by hand since it never changes at runtime. */
const DATASET_FIELDS: Record<ReportDataset, ReportField[]> = {
  projects: [
    { key: "name", label: "Name" },
    { key: "address", label: "Address" },
    { key: "client", label: "Client" },
    { key: "handoverDate", label: "Handover date" },
    { key: "warrantyMonths", label: "Warranty (months)" },
    { key: "createdAt", label: "Created" },
  ],
  invoices: [
    { key: "number", label: "Number" },
    { key: "status", label: "Status" },
    { key: "client", label: "Client" },
    { key: "project", label: "Project" },
    { key: "subtotal", label: "Subtotal" },
    { key: "taxAmount", label: "Tax" },
    { key: "total", label: "Total" },
    { key: "dueDate", label: "Due date" },
    { key: "createdAt", label: "Created" },
  ],
  estimates: [
    { key: "name", label: "Name" },
    { key: "status", label: "Status" },
    { key: "project", label: "Project" },
    { key: "grandTotal", label: "Grand total" },
    { key: "createdAt", label: "Created" },
  ],
  time_entries: [
    { key: "worker", label: "Worker" },
    { key: "project", label: "Project" },
    { key: "task", label: "Task" },
    { key: "hours", label: "Hours" },
    { key: "date", label: "Date" },
  ],
  punch_list: [
    { key: "title", label: "Title" },
    { key: "status", label: "Status" },
    { key: "project", label: "Project" },
    { key: "dueDate", label: "Due date" },
    { key: "createdAt", label: "Created" },
  ],
  rfis: [
    { key: "number", label: "Number" },
    { key: "subject", label: "Subject" },
    { key: "status", label: "Status" },
    { key: "project", label: "Project" },
    { key: "dueDate", label: "Due date" },
    { key: "createdAt", label: "Created" },
  ],
};

const NO_STATUS_DATASETS = new Set<ReportDataset>(["projects", "time_entries"]);

interface RunResult {
  columns: ReportField[];
  rows: Record<string, unknown>[];
}
interface SavedReport {
  id: string;
  name: string;
  dataset: ReportDataset;
  columns: string[];
  user: { name: string };
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string" && ISO_DATE_RE.test(value)) return new Date(value).toLocaleDateString();
  return String(value);
}

export function CustomReportsPanel() {
  const t = useTranslations("customReports");
  const tc = useTranslations("common");

  const [saved, setSaved] = useState<SavedReport[] | null>(null);
  const [dataset, setDataset] = useState<ReportDataset>("projects");
  const [columns, setColumns] = useState<string[]>(DATASET_FIELDS.projects.map((f) => f.key));
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusEquals, setStatusEquals] = useState("");
  const [reportName, setReportName] = useState("");
  const [result, setResult] = useState<RunResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedResult, setSavedResult] = useState<{ id: string; result: RunResult } | null>(null);

  function load() {
    apiFetch<SavedReport[]>("/custom-reports").then(setSaved);
  }

  useEffect(load, []);

  function changeDataset(next: ReportDataset) {
    setDataset(next);
    setColumns(DATASET_FIELDS[next].map((f) => f.key));
    setStatusEquals("");
    setResult(null);
  }

  function toggleColumn(key: string) {
    setColumns((cols) => (cols.includes(key) ? cols.filter((c) => c !== key) : [...cols, key]));
  }

  function currentDefinition() {
    return {
      dataset,
      columns,
      dateFrom: dateFrom ? new Date(dateFrom).toISOString() : undefined,
      dateTo: dateTo ? new Date(dateTo).toISOString() : undefined,
      statusEquals: statusEquals.trim() || undefined,
    };
  }

  async function preview() {
    if (columns.length === 0) return;
    setBusy(true);
    try {
      const res = await apiFetch<RunResult>("/custom-reports/preview", {
        method: "POST",
        body: JSON.stringify(currentDefinition()),
      });
      setResult(res);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!reportName.trim() || columns.length === 0) return;
    setBusy(true);
    try {
      await apiFetch("/custom-reports", {
        method: "POST",
        body: JSON.stringify({ ...currentDefinition(), name: reportName.trim() }),
      });
      setReportName("");
      load();
    } finally {
      setBusy(false);
    }
  }

  async function runSaved(report: SavedReport) {
    if (savedResult?.id === report.id) {
      setSavedResult(null);
      return;
    }
    const res = await apiFetch<RunResult>(`/custom-reports/${report.id}/run`);
    setSavedResult({ id: report.id, result: res });
  }

  async function exportSavedCsv(report: SavedReport) {
    const blob = await apiFetch<Blob>(`/custom-reports/${report.id}/export.csv`);
    downloadBlob(blob, `${report.name}.csv`);
  }

  async function deleteSaved(id: string) {
    await apiFetch(`/custom-reports/${id}`, { method: "DELETE" });
    if (savedResult?.id === id) setSavedResult(null);
    load();
  }

  return (
    <div className="mt-10">
      <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("title")}</h2>
      <p className="mb-4 text-xs text-gray-500">{t("hint")}</p>

      <div className="card flex flex-col gap-4">
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700">{t("dataset")}</span>
            <select className="input" value={dataset} onChange={(e) => changeDataset(e.target.value as ReportDataset)}>
              {REPORT_DATASETS.map((d) => (
                <option key={d} value={d}>
                  {t(`dataset_${d}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700">{t("dateFrom")}</span>
            <input type="date" className="input" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700">{t("dateTo")}</span>
            <input type="date" className="input" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
          {!NO_STATUS_DATASETS.has(dataset) && (
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700">{t("statusEquals")}</span>
              <input
                className="input"
                placeholder={t("statusPlaceholder")}
                value={statusEquals}
                onChange={(e) => setStatusEquals(e.target.value)}
              />
            </label>
          )}
        </div>

        <div>
          <span className="mb-1.5 block text-sm font-medium text-gray-700">{t("columns")}</span>
          <div className="flex flex-wrap gap-3">
            {DATASET_FIELDS[dataset].map((f) => (
              <label key={f.key} className="flex items-center gap-1.5 text-xs text-gray-600">
                <input type="checkbox" checked={columns.includes(f.key)} onChange={() => toggleColumn(f.key)} />
                {f.label}
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <button onClick={preview} disabled={busy || columns.length === 0} className="btn-secondary">
            {t("preview")}
          </button>
          <input
            className="input w-auto"
            placeholder={t("reportNamePlaceholder")}
            value={reportName}
            onChange={(e) => setReportName(e.target.value)}
          />
          <button onClick={save} disabled={busy || !reportName.trim() || columns.length === 0} className="btn-primary">
            {tc("save")}
          </button>
        </div>

        {result && <ReportTable result={result} emptyLabel={t("noRows")} />}
      </div>

      <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-gray-500">{t("savedReports")}</h3>
      {saved === null ? (
        <p className="text-sm text-gray-400">{tc("loading")}</p>
      ) : saved.length === 0 ? (
        <p className="text-sm text-gray-400">{t("noSavedReports")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {saved.map((r) => (
            <li key={r.id} className="card">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-gray-900">{r.name}</div>
                  <div className="text-xs text-gray-500">
                    {t(`dataset_${r.dataset}`)} · {t("createdBy", { name: r.user.name })}
                  </div>
                </div>
                <div className="flex flex-none gap-1.5">
                  <button onClick={() => runSaved(r)} className="btn-secondary px-2.5 py-1 text-xs">
                    {savedResult?.id === r.id ? tc("close") : t("run")}
                  </button>
                  <button onClick={() => exportSavedCsv(r)} className="btn-secondary px-2.5 py-1 text-xs">
                    {t("exportCsv")}
                  </button>
                  <button onClick={() => deleteSaved(r.id)} className="text-xs text-gray-400 hover:text-error-600">
                    {tc("delete")}
                  </button>
                </div>
              </div>
              {savedResult?.id === r.id && (
                <div className="mt-3 border-t border-gray-100 pt-3">
                  <ReportTable result={savedResult.result} emptyLabel={t("noRows")} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReportTable({ result, emptyLabel }: { result: RunResult; emptyLabel: string }) {
  if (result.rows.length === 0) return <p className="text-sm text-gray-400">{emptyLabel}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-gray-500">
            {result.columns.map((c) => (
              <th key={c.key} className="py-2 pr-4">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, i) => (
            <tr key={i} className="border-b border-gray-100">
              {result.columns.map((c) => (
                <td key={c.key} className="py-1.5 pr-4">
                  {formatCell(row[c.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
