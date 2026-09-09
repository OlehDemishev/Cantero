"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { LongLeadItemStatus } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";

interface Supplier {
  id: string;
  name: string;
}
interface LongLeadRisk {
  risk: "delivered_on_time" | "delivered_late" | "on_track" | "at_risk" | "critical" | "unscheduled";
  slackDays: number | null;
}
interface LongLeadItem extends LongLeadRisk {
  id: string;
  description: string;
  status: LongLeadItemStatus;
  supplier: Supplier | null;
  expectedDeliveryDate: string | null;
  actualDeliveryDate: string | null;
  requiredOnSiteDate: string | null;
  notes: string | null;
}

const STATUSES: LongLeadItemStatus[] = ["tracking", "ordered", "in_fabrication", "shipped", "delivered"];
const RISK_STYLES: Record<LongLeadRisk["risk"], string> = {
  delivered_on_time: "bg-success-50 dark:bg-success-500/15 text-success-700 dark:text-success-500",
  delivered_late: "bg-error-50 dark:bg-error-500/15 text-error-700 dark:text-error-500",
  on_track: "bg-success-50 dark:bg-success-500/15 text-success-700 dark:text-success-500",
  at_risk: "bg-warning-50 dark:bg-warning-500/15 text-warning-700 dark:text-warning-500",
  critical: "bg-error-50 dark:bg-error-500/15 text-error-700 dark:text-error-500",
  unscheduled: "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400",
};

const EMPTY_FORM = { description: "", supplierId: "", requiredOnSiteDate: "", expectedDeliveryDate: "" };

export function LongLeadItemsPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("longLeadItems");
  const tc = useTranslations("common");

  const [items, setItems] = useState<LongLeadItem[] | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<LongLeadItem[]>(`/long-lead-items?projectId=${projectId}`).then(setItems);
  }

  useEffect(load, [projectId]);
  useEffect(() => {
    apiFetch<Supplier[]>("/materials/suppliers").then(setSuppliers);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch("/long-lead-items", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          description: form.description,
          supplierId: form.supplierId || undefined,
          requiredOnSiteDate: form.requiredOnSiteDate ? new Date(form.requiredOnSiteDate).toISOString() : undefined,
          expectedDeliveryDate: form.expectedDeliveryDate ? new Date(form.expectedDeliveryDate).toISOString() : undefined,
        }),
      });
      setForm(EMPTY_FORM);
      setCreating(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function updateField(id: string, field: string, value: string | null) {
    await apiFetch(`/long-lead-items/${id}`, { method: "PATCH", body: JSON.stringify({ [field]: value ? new Date(value).toISOString() : null }) });
    load();
  }

  async function updateStatus(id: string, status: LongLeadItemStatus) {
    await apiFetch(`/long-lead-items/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    load();
  }

  if (items === null) return null;

  return (
    <div className="mt-10">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t("title")}</h2>
        {!creating && (
          <button onClick={() => setCreating(true)} className="btn-secondary px-3 py-1 text-xs">
            {t("newItem")}
          </button>
        )}
      </div>
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{t("hint")}</p>

      {creating && (
        <form onSubmit={submit} className="card mb-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700 dark:text-gray-200">{t("description")}</span>
            <input required className="input" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </label>
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-200">{t("supplier")}</span>
              <select className="input" value={form.supplierId} onChange={(e) => setForm((f) => ({ ...f, supplierId: e.target.value }))}>
                <option value="">—</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-200">{t("requiredOnSiteDate")}</span>
              <input
                type="date"
                className="input"
                value={form.requiredOnSiteDate}
                onChange={(e) => setForm((f) => ({ ...f, requiredOnSiteDate: e.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-200">{t("expectedDeliveryDate")}</span>
              <input
                type="date"
                className="input"
                value={form.expectedDeliveryDate}
                onChange={(e) => setForm((f) => ({ ...f, expectedDeliveryDate: e.target.value }))}
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="btn-primary">
              {tc("save")}
            </button>
            <button type="button" onClick={() => setCreating(false)} className="btn-secondary">
              {tc("cancel")}
            </button>
          </div>
        </form>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{t("noItems")}</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500 dark:border-gray-800">
                <th className="py-2">{t("description")}</th>
                <th>{t("supplier")}</th>
                <th>{t("status")}</th>
                <th>{t("requiredOnSiteDate")}</th>
                <th>{t("expectedDeliveryDate")}</th>
                <th>{t("actualDeliveryDate")}</th>
                <th>{t("risk")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-gray-100 dark:border-gray-800/60">
                  <td className="py-1.5">{item.description}</td>
                  <td>{item.supplier?.name ?? "—"}</td>
                  <td>
                    <select
                      className="input py-0.5 text-xs"
                      value={item.status}
                      onChange={(e) => updateStatus(item.id, e.target.value as LongLeadItemStatus)}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {t(`status_${s}`)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="date"
                      className="input py-0.5 text-xs"
                      value={item.requiredOnSiteDate?.slice(0, 10) ?? ""}
                      onChange={(e) => updateField(item.id, "requiredOnSiteDate", e.target.value || null)}
                    />
                  </td>
                  <td>
                    <input
                      type="date"
                      className="input py-0.5 text-xs"
                      value={item.expectedDeliveryDate?.slice(0, 10) ?? ""}
                      onChange={(e) => updateField(item.id, "expectedDeliveryDate", e.target.value || null)}
                    />
                  </td>
                  <td>
                    <input
                      type="date"
                      className="input py-0.5 text-xs"
                      value={item.actualDeliveryDate?.slice(0, 10) ?? ""}
                      onChange={(e) => updateField(item.id, "actualDeliveryDate", e.target.value || null)}
                    />
                  </td>
                  <td>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${RISK_STYLES[item.risk]}`}>
                      {t(`risk_${item.risk}`)}
                      {item.slackDays !== null && ` (${item.slackDays >= 0 ? "+" : ""}${item.slackDays}d)`}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
