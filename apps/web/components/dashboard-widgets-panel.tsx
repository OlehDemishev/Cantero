"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { DASHBOARD_WIDGET_TYPES, type DashboardWidgetType } from "@cantero/shared";
import { apiFetch, downloadBlob, ApiError } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";
import { formatDate } from "@/lib/format-date";
import { formatCurrency } from "@/lib/format-currency";
import { useReportFieldLabel } from "@/lib/report-field-label";

interface CustomReportOption {
  id: string;
  name: string;
}
interface Widget {
  id: string;
  type: DashboardWidgetType;
  config: Record<string, unknown> | null;
  sortOrder: number;
  data: unknown;
}

export function DashboardWidgetsPanel() {
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "";

  const [widgets, setWidgets] = useState<Widget[] | null>(null);
  const [customReports, setCustomReports] = useState<CustomReportOption[]>([]);
  const [newType, setNewType] = useState<DashboardWidgetType>("revenue_trend");
  const [newCustomReportId, setNewCustomReportId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<Widget[]>("/dashboard-widgets").then(setWidgets);
  }

  useEffect(() => {
    load();
    apiFetch<CustomReportOption[]>("/custom-reports").then(setCustomReports);
  }, []);

  async function addWidget(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/dashboard-widgets", {
        method: "POST",
        body: JSON.stringify({
          type: newType,
          config: newType === "custom_report" && newCustomReportId ? { customReportId: newCustomReportId } : undefined,
        }),
      });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tc("error"));
    } finally {
      setBusy(false);
    }
  }

  async function removeWidget(id: string) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/dashboard-widgets/${id}`, { method: "DELETE" });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tc("error"));
    } finally {
      setBusy(false);
    }
  }

  async function move(index: number, direction: -1 | 1) {
    if (!widgets) return;
    const previous = widgets;
    const next = [...widgets];
    const swapWith = index + direction;
    if (swapWith < 0 || swapWith >= next.length) return;
    [next[index], next[swapWith]] = [next[swapWith], next[index]];
    setWidgets(next);
    try {
      await apiFetch("/dashboard-widgets/reorder", { method: "POST", body: JSON.stringify({ orderedIds: next.map((w) => w.id) }) });
    } catch (err) {
      setWidgets(previous);
      setError(err instanceof ApiError ? err.message : tc("error"));
    }
  }

  async function downloadPdf() {
    const blob = await apiFetch<Blob>("/dashboard-widgets/export.pdf");
    downloadBlob(blob, "dashboard.pdf");
  }

  return (
    <div className="mt-10">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-fg-muted">{t("myWidgets")}</h2>
        {widgets && widgets.length > 0 && (
          <button onClick={downloadPdf} className="btn-secondary px-3 py-1 text-xs">
            {t("downloadDashboardPdf")}
          </button>
        )}
      </div>

      <form onSubmit={addWidget} className="mb-4 flex flex-wrap items-end gap-2">
        <select className="input w-auto" value={newType} onChange={(e) => setNewType(e.target.value as DashboardWidgetType)}>
          {DASHBOARD_WIDGET_TYPES.map((ty) => (
            <option key={ty} value={ty}>
              {t(`widgetType_${ty}`)}
            </option>
          ))}
        </select>
        {newType === "custom_report" && (
          <select className="input w-auto" value={newCustomReportId} onChange={(e) => setNewCustomReportId(e.target.value)}>
            <option value="">{t("selectCustomReport")}</option>
            {customReports.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        )}
        <button type="submit" disabled={busy} className="btn-secondary">
          {t("addWidget")}
        </button>
      </form>
      {error && <p className="mb-3 text-xs text-danger-fg">{error}</p>}

      {!widgets ? (
        <p className="text-sm text-fg-subtle">{tc("loading")}</p>
      ) : widgets.length === 0 ? (
        <p className="text-sm text-fg-subtle">{t("noWidgets")}</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {widgets.map((w, i) => (
            <div key={w.id} className="card">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t(`widgetType_${w.type}`)}</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => move(i, -1)} disabled={i === 0} className="text-xs text-fg-subtle hover:text-fg-muted disabled:opacity-30">
                    ↑
                  </button>
                  <button
                    onClick={() => move(i, 1)}
                    disabled={i === widgets.length - 1}
                    className="text-xs text-fg-subtle hover:text-fg-muted disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button onClick={() => removeWidget(w.id)} className="ml-1 text-xs text-danger-fg hover:underline">
                    {tc("delete")}
                  </button>
                </div>
              </div>
              <WidgetBody type={w.type} data={w.data} currency={currency} emptyLabel={t("noData")} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WidgetBody({
  type,
  data,
  currency,
  emptyLabel,
}: {
  type: DashboardWidgetType;
  data: unknown;
  currency: string;
  emptyLabel: string;
}) {
  const t = useTranslations("dashboard");
  const fieldLabel = useReportFieldLabel();

  if (!data) return <p className="text-sm text-fg-subtle">{emptyLabel}</p>;

  if (type === "revenue_trend" && Array.isArray(data)) {
    const rows = data as { month: string; revenue: number }[];
    const max = Math.max(...rows.map((r) => r.revenue), 1);
    return (
      <div className="flex items-end gap-1.5" style={{ minHeight: 90 }}>
        {rows.map((r) => (
          <div key={r.month} className="flex flex-1 flex-col items-center gap-1">
            <div className="w-full rounded-t bg-brand-500" style={{ height: `${Math.max((r.revenue / max) * 70, 2)}px` }} />
            <div className="text-[9px] text-fg-subtle">{r.month.slice(5)}</div>
          </div>
        ))}
      </div>
    );
  }

  if (type === "cash_flow_forecast" && typeof data === "object") {
    const d = data as { totals: { inflow: number; outflow: number; net: number } };
    return (
      <div className="grid grid-cols-3 gap-2 text-center text-sm">
        <div>
          <div className="text-xs text-fg-subtle">{t("widgetIn")}</div>
          <div className="font-semibold text-success-fg">
            {formatCurrency(d.totals.inflow, currency)}
          </div>
        </div>
        <div>
          <div className="text-xs text-fg-subtle">{t("widgetOut")}</div>
          <div className="font-semibold text-danger-fg">
            {formatCurrency(d.totals.outflow, currency)}
          </div>
        </div>
        <div>
          <div className="text-xs text-fg-subtle">{t("widgetNet")}</div>
          <div className="font-semibold">
            {formatCurrency(d.totals.net, currency)}
          </div>
        </div>
      </div>
    );
  }

  if (type === "portfolio_summary" && typeof data === "object") {
    const d = data as { summary: { projectsTotal: number; projectsAtRisk: number; openRfiTotal: number } };
    return (
      <div className="grid grid-cols-3 gap-2 text-center text-sm">
        <div>
          <div className="text-xs text-fg-subtle">{t("widgetProjects")}</div>
          <div className="font-semibold">{d.summary.projectsTotal}</div>
        </div>
        <div>
          <div className="text-xs text-fg-subtle">{t("widgetAtRisk")}</div>
          <div className="font-semibold text-danger-fg">{d.summary.projectsAtRisk}</div>
        </div>
        <div>
          <div className="text-xs text-fg-subtle">{t("widgetOpenRfis")}</div>
          <div className="font-semibold">{d.summary.openRfiTotal}</div>
        </div>
      </div>
    );
  }

  if (type === "backlog" && typeof data === "object") {
    const d = data as { backlog: number; contractValue: number; billedToDate: number };
    return (
      <div className="text-center">
        <div className="text-2xl font-semibold text-fg">
          {formatCurrency(d.backlog, currency)}
        </div>
        <div className="mt-1 text-xs text-fg-subtle">
          {t("widgetBacklogDetail", { contractValue: formatCurrency(d.contractValue, currency), billedToDate: formatCurrency(d.billedToDate, currency) })}
        </div>
      </div>
    );
  }

  if (type === "compliance_calendar" && typeof data === "object") {
    const d = data as {
      items: { type: string; label: string; holderName: string | null; expiresAt: string; status: "expired" | "expiring" }[];
      expiredCount: number;
      expiringCount: number;
    };
    return (
      <div>
        <div className="mb-3 grid grid-cols-2 gap-2 text-center text-sm">
          <div>
            <div className="text-xs text-fg-subtle">{t("widgetExpired")}</div>
            <div className={`font-semibold ${d.expiredCount > 0 ? "text-danger-fg" : "text-fg"}`}>{d.expiredCount}</div>
          </div>
          <div>
            <div className="text-xs text-fg-subtle">{t("widgetExpiringSoon")}</div>
            <div className="font-semibold text-warning-fg">{d.expiringCount}</div>
          </div>
        </div>
        {d.items.length === 0 ? (
          <p className="text-sm text-fg-subtle">{emptyLabel}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {d.items.slice(0, 6).map((item, i) => (
              <li key={i} className="flex items-center justify-between text-xs">
                <span className="truncate text-fg-muted">
                  {item.label}
                  {item.holderName && <span className="text-fg-subtle"> — {item.holderName}</span>}
                </span>
                <span className={item.status === "expired" ? "text-danger-fg" : "text-fg-subtle"}>
                  {formatDate(new Date(item.expiresAt))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (type === "custom_report" && typeof data === "object") {
    const d = data as { columns: { key: string; label: string; labelKey?: string }[]; rows: Record<string, unknown>[] };
    if (d.rows.length === 0) return <p className="text-sm text-fg-subtle">{emptyLabel}</p>;
    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-fg-subtle">
              {d.columns.map((c) => (
                <th key={c.key} className="py-1 pr-2">
                  {fieldLabel(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.rows.slice(0, 5).map((row, i) => (
              <tr key={i} className="border-b border-gray-100 dark:border-gray-700">
                {d.columns.map((c) => (
                  <td key={c.key} className="py-1 pr-2">
                    {String(row[c.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Generic array-of-objects fallback (project_margins, invoice_aging, warehouse_turnover, labor_cost, etc.)
  const nested = data as { byWorker?: unknown[]; invoices?: unknown[] };
  const rows = Array.isArray(data) ? data : (nested.byWorker ?? nested.invoices ?? []);
  if (!Array.isArray(rows) || rows.length === 0) return <p className="text-sm text-fg-subtle">{emptyLabel}</p>;
  const columns = Object.keys(rows[0] as Record<string, unknown>).slice(0, 4);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-fg-subtle">
            {columns.map((c) => (
              <th key={c} className="py-1 pr-2">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(rows as Record<string, unknown>[]).slice(0, 5).map((row, i) => (
            <tr key={i} className="border-b border-gray-100 dark:border-gray-700">
              {columns.map((c) => (
                <td key={c} className="py-1 pr-2">
                  {String(row[c] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
