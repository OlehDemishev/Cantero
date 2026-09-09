"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AGGREGATE_REPORT_DATASETS, REPORT_DATASETS, type ReportDataset } from "@cantero/shared";
import { apiFetch, downloadBlob } from "@/lib/api-client";
import { formatDate } from "@/lib/format-date";
import { resetStateInEffect } from "@/lib/effect-reset";

interface ReportField {
  key: string;
  label: string;
}

const NO_STATUS_DATASETS = new Set<ReportDataset>(["projects", "time_entries"]);
const AGGREGATE_DATASETS = new Set<ReportDataset>(AGGREGATE_REPORT_DATASETS);
/** Aggregate datasets get a chart alongside the table — this maps each to its category/value
 * columns so the chart doesn't need to guess which numeric column to plot. */
const CHART_CONFIG: Partial<Record<ReportDataset, { type: "bar" | "line"; category: string; value: string }>> = {
  revenue_by_month: { type: "line", category: "month", value: "revenue" },
  project_margins: { type: "bar", category: "projectName", value: "margin" },
  labor_utilization: { type: "bar", category: "workerName", value: "cost" },
};

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
  if (typeof value === "string" && ISO_DATE_RE.test(value)) return formatDate(new Date(value));
  return String(value);
}

export function CustomReportsPanel() {
  const t = useTranslations("customReports");
  const tc = useTranslations("common");

  const [saved, setSaved] = useState<SavedReport[] | null>(null);
  const [dataset, setDataset] = useState<ReportDataset>("projects");
  const [fields, setFields] = useState<ReportField[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
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

  useEffect(() => {
    apiFetch<ReportField[]>(`/custom-reports/fields?dataset=${dataset}`).then((f) => {
      setFields(f);
      setColumns(f.map((field) => field.key));
    });
    resetStateInEffect(() => {
      setStatusEquals("");
      setResult(null);
    });
  }, [dataset]);

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
    if (!window.confirm(t("confirmDeleteSavedReport"))) return;
    await apiFetch(`/custom-reports/${id}`, { method: "DELETE" });
    if (savedResult?.id === id) setSavedResult(null);
    load();
  }

  const isAggregate = AGGREGATE_DATASETS.has(dataset);

  return (
    <div className="mt-10">
      <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("title")}</h2>
      <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">{t("hint")}</p>

      <div className="card flex flex-col gap-4">
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700 dark:text-gray-200">{t("dataset")}</span>
            <select className="input" value={dataset} onChange={(e) => setDataset(e.target.value as ReportDataset)}>
              {REPORT_DATASETS.map((d) => (
                <option key={d} value={d}>
                  {t(`dataset_${d}`)}
                </option>
              ))}
            </select>
          </label>
          {!isAggregate && (
            <>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-gray-700 dark:text-gray-200">{t("dateFrom")}</span>
                <input type="date" className="input" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-gray-700 dark:text-gray-200">{t("dateTo")}</span>
                <input type="date" className="input" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </label>
              {!NO_STATUS_DATASETS.has(dataset) && (
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-gray-700 dark:text-gray-200">{t("statusEquals")}</span>
                  <input
                    className="input"
                    placeholder={t("statusPlaceholder")}
                    value={statusEquals}
                    onChange={(e) => setStatusEquals(e.target.value)}
                  />
                </label>
              )}
            </>
          )}
        </div>

        <div>
          <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-200">{t("columns")}</span>
          <div className="flex flex-wrap gap-3">
            {fields.map((f) => (
              <label key={f.key} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
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

        {result && (
          <>
            <ReportChart dataset={dataset} rows={result.rows} />
            <ReportTable result={result} emptyLabel={t("noRows")} />
          </>
        )}
      </div>

      <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t("savedReports")}</h3>
      {saved === null ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{tc("loading")}</p>
      ) : saved.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{t("noSavedReports")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {saved.map((r) => (
            <li key={r.id} className="card">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-50">{r.name}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
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
                  <button onClick={() => deleteSaved(r.id)} className="text-xs text-gray-400 dark:text-gray-500 hover:text-error-600">
                    {tc("delete")}
                  </button>
                </div>
              </div>
              {savedResult?.id === r.id && (
                <div className="mt-3 border-t border-gray-100 dark:border-gray-700 pt-3">
                  <ReportChart dataset={r.dataset} rows={savedResult.result.rows} />
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

function ReportChart({ dataset, rows }: { dataset: ReportDataset; rows: Record<string, unknown>[] }) {
  const config = CHART_CONFIG[dataset];
  if (!config || rows.length === 0) return null;
  // Only chart if both configured columns actually came back (the user may have unchecked one).
  if (!(config.category in rows[0]) || !(config.value in rows[0])) return null;

  const data = rows.map((r) => ({ ...r, [config.value]: Number(r[config.value] ?? 0) }));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        {config.type === "line" ? (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-gray-200, #e5e7eb)" />
            <XAxis dataKey={config.category} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Line type="monotone" dataKey={config.value} stroke="#465fff" strokeWidth={2} dot={false} />
          </LineChart>
        ) : (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-gray-200, #e5e7eb)" />
            <XAxis dataKey={config.category} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey={config.value} fill="#465fff" radius={[4, 4, 0, 0]} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

function ReportTable({ result, emptyLabel }: { result: RunResult; emptyLabel: string }) {
  if (result.rows.length === 0) return <p className="text-sm text-gray-400 dark:text-gray-500">{emptyLabel}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
            {result.columns.map((c) => (
              <th key={c.key} className="py-2 pr-4">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, i) => (
            <tr key={i} className="border-b border-gray-100 dark:border-gray-700">
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
