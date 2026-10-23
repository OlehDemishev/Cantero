"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { LongLeadItemStatus } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { useCan } from "@/lib/permissions";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { statusTone } from "@/lib/status-tone";
import { Field } from "@/components/ui/field";

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

const EMPTY_FORM = { description: "", supplierId: "", requiredOnSiteDate: "", expectedDeliveryDate: "" };

export function LongLeadItemsPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("longLeadItems");
  const tc = useTranslations("common");
  const ta = useTranslations("a11y");

  const { data: items = null, reload: reloadItems, error: itemsError } = useApi<LongLeadItem[]>(`/long-lead-items?projectId=${projectId}`);
  const canSeeSuppliers = useCan()("purchasing.view");
  const { data: suppliers = [] } = useApi<Supplier[]>(canSeeSuppliers ? "/materials/suppliers" : null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  function load() {
    void reloadItems();
  }

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

  if (items === null) return itemsError ? <ErrorState error={itemsError} onRetry={reloadItems} compact /> : <Skeleton lines={3} />;

  return (
    <div className="mt-10">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-fg-muted">{t("title")}</h2>
        {!creating && (
          <button onClick={() => setCreating(true)} className="btn-secondary px-3 py-1 text-xs">
            {t("newItem")}
          </button>
        )}
      </div>
      <p className="mb-3 text-xs text-fg-subtle">{t("hint")}</p>

      {creating && (
        <form onSubmit={submit} className="card mb-4 flex flex-col gap-3">
          <Field label={t("description")}>
            <input required className="input" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </Field>
          <div className="flex flex-wrap gap-3">
            <Field label={t("supplier")}>
              <select className="input" value={form.supplierId} onChange={(e) => setForm((f) => ({ ...f, supplierId: e.target.value }))}>
                <option value="">—</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("requiredOnSiteDate")}>
              <input
                type="date"
                className="input"
                value={form.requiredOnSiteDate}
                onChange={(e) => setForm((f) => ({ ...f, requiredOnSiteDate: e.target.value }))}
              />
            </Field>
            <Field label={t("expectedDeliveryDate")}>
              <input
                type="date"
                className="input"
                value={form.expectedDeliveryDate}
                onChange={(e) => setForm((f) => ({ ...f, expectedDeliveryDate: e.target.value }))}
              />
            </Field>
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
        <p className="text-sm text-fg-subtle">{t("noItems")}</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500 dark:border-gray-800">
                <th scope="col" className="py-2">{t("description")}</th>
                <th scope="col">{t("supplier")}</th>
                <th scope="col">{t("status")}</th>
                <th scope="col">{t("requiredOnSiteDate")}</th>
                <th scope="col">{t("expectedDeliveryDate")}</th>
                <th scope="col">{t("actualDeliveryDate")}</th>
                <th scope="col">{t("risk")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-gray-100 dark:border-gray-800/60">
                  <td className="py-1.5">{item.description}</td>
                  <td>{item.supplier?.name ?? "—"}</td>
                  <td>
                    <select aria-label={ta("fieldOf", { field: t("status"), item: item.description })}
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
                    <input aria-label={ta("fieldOf", { field: t("requiredOnSiteDate"), item: item.description })}
                      type="date"
                      className="input py-0.5 text-xs"
                      value={item.requiredOnSiteDate?.slice(0, 10) ?? ""}
                      onChange={(e) => updateField(item.id, "requiredOnSiteDate", e.target.value || null)}
                    />
                  </td>
                  <td>
                    <input aria-label={ta("fieldOf", { field: t("expectedDeliveryDate"), item: item.description })}
                      type="date"
                      className="input py-0.5 text-xs"
                      value={item.expectedDeliveryDate?.slice(0, 10) ?? ""}
                      onChange={(e) => updateField(item.id, "expectedDeliveryDate", e.target.value || null)}
                    />
                  </td>
                  <td>
                    <input aria-label={ta("fieldOf", { field: t("actualDeliveryDate"), item: item.description })}
                      type="date"
                      className="input py-0.5 text-xs"
                      value={item.actualDeliveryDate?.slice(0, 10) ?? ""}
                      onChange={(e) => updateField(item.id, "actualDeliveryDate", e.target.value || null)}
                    />
                  </td>
                  <td>
                    <Badge tone={statusTone(item.risk, "longLead")}>
                      {t(`risk_${item.risk}`)}
                      {item.slackDays !== null && ` (${item.slackDays >= 0 ? "+" : ""}${item.slackDays}d)`}
                    </Badge>
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
