"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { RECEIVING_DISCREPANCY_RESOLUTIONS, type ReceivingDiscrepancyResolution, type ReceivingDiscrepancyType } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";

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
  const [discrepancies, setDiscrepancies] = useState<ReceivingDiscrepancy[] | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolutionForm, setResolutionForm] = useState({ resolution: "credit_issued" as ReceivingDiscrepancyResolution, resolutionNotes: "" });

  function load() {
    apiFetch<ReceivingDiscrepancy[]>("/materials/purchase-orders/receiving-discrepancies").then(setDiscrepancies);
  }

  useEffect(load, []);

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
      <h2 className="mb-1 text-sm font-semibold text-gray-700">{t("discrepanciesTitle")}</h2>
      <p className="mb-3 text-xs text-gray-500">{t("discrepanciesHint")}</p>
      {!discrepancies ? (
        <p className="text-sm text-gray-500">{tc("loading")}</p>
      ) : discrepancies.length === 0 ? (
        <p className="text-sm text-gray-400">{t("noDiscrepancies")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {discrepancies.map((d) => (
            <li key={d.id} className="card">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900">
                  {t(`discrepancyType_${d.type}`)} · {d.purchaseOrderLine.materialCatalogItem.code} × {d.quantity}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    d.resolution === "pending" ? "bg-warning-50 text-warning-700" : "bg-success-50 text-success-700"
                  }`}
                >
                  {t(`resolution_${d.resolution}`)}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-400">{d.purchaseOrder.supplier.name}</p>
              {d.resolutionNotes && <p className="mt-1 text-xs text-gray-500">{d.resolutionNotes}</p>}
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
