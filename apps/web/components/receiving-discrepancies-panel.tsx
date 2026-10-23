"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { RECEIVING_DISCREPANCY_RESOLUTIONS, type ReceivingDiscrepancyResolution, type ReceivingDiscrepancyType } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";

interface ReceivingDiscrepancy {
  id: string;
  type: ReceivingDiscrepancyType;
  quantity: string;
  resolution: ReceivingDiscrepancyResolution;
  resolutionNotes: string | null;
  purchaseOrder: { id: string; supplier: { id: string; name: string } };
  purchaseOrderLine: { id: string; materialCatalogItem: { id: string; code: string; name: string } };
}

export function ReceivingDiscrepanciesPanel() {
  const t = useTranslations("purchaseOrders");
  const tc = useTranslations("common");
  const { data: discrepancies = null, reload: reloadDiscrepancies } = useApi<ReceivingDiscrepancy[]>("/materials/purchase-orders/receiving-discrepancies");
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolutionForm, setResolutionForm] = useState({ resolution: "credit_issued" as ReceivingDiscrepancyResolution, resolutionNotes: "" });

  function load() {
    void reloadDiscrepancies();
  }

  async function resolveDiscrepancy(id: string) {
    await apiFetch(`/materials/purchase-orders/receiving-discrepancies/${id}/resolve`, {
      method: "POST",
      body: JSON.stringify({ resolution: resolutionForm.resolution, resolutionNotes: resolutionForm.resolutionNotes || undefined }),
    });
    setResolvingId(null);
    setResolutionForm({ resolution: "credit_issued", resolutionNotes: "" });
    load();
  }

  return (
    <div className="mt-10">
      <h2 className="mb-1 text-sm font-semibold text-fg-muted">{t("discrepanciesTitle")}</h2>
      <p className="mb-3 text-xs text-fg-subtle">{t("discrepanciesHint")}</p>
      {!discrepancies ? (
        <p className="text-sm text-fg-subtle">{tc("loading")}</p>
      ) : discrepancies.length === 0 ? (
        <p className="text-sm text-fg-subtle">{t("noDiscrepancies")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {discrepancies.map((d) => (
            <li key={d.id} className="card">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-fg">
                  {t(`discrepancyType_${d.type}`)} · {d.purchaseOrderLine.materialCatalogItem.code} × {d.quantity}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    d.resolution === "pending" ? "bg-warning-50 dark:bg-warning-500/15 text-warning-fg" : "bg-success-50 dark:bg-success-500/15 text-success-fg"
                  }`}
                >
                  {t(`resolution_${d.resolution}`)}
                </span>
              </div>
              <p className="mt-1 text-xs text-fg-subtle">{d.purchaseOrder.supplier.name}</p>
              {d.resolutionNotes && <p className="mt-1 text-xs text-fg-subtle">{d.resolutionNotes}</p>}
              {d.resolution === "pending" &&
                (resolvingId === d.id ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <select
                      className="input"
                      value={resolutionForm.resolution}
                      onChange={(e) => setResolutionForm((f) => ({ ...f, resolution: e.target.value as ReceivingDiscrepancyResolution }))}
                    >
                      {RECEIVING_DISCREPANCY_RESOLUTIONS.filter((r) => r !== "pending").map((r) => (
                        <option key={r} value={r}>
                          {t(`resolution_${r}`)}
                        </option>
                      ))}
                    </select>
                    <input
                      placeholder={t("resolutionNotesPlaceholder")}
                      className="input flex-1"
                      value={resolutionForm.resolutionNotes}
                      onChange={(e) => setResolutionForm((f) => ({ ...f, resolutionNotes: e.target.value }))}
                    />
                    <button onClick={() => resolveDiscrepancy(d.id)} className="btn-primary px-2.5 py-1 text-xs">
                      {tc("save")}
                    </button>
                    <button onClick={() => setResolvingId(null)} className="btn-secondary px-2.5 py-1 text-xs">
                      {tc("cancel")}
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setResolvingId(d.id)} className="btn-secondary mt-2 px-2.5 py-1 text-xs">
                    {t("resolve")}
                  </button>
                ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
