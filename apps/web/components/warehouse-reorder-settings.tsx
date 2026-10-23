"use client";

import { Fragment, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { useCan } from "@/lib/permissions";
import { formatDate } from "@/lib/format-date";

interface MaterialCatalogItem {
  id: string;
  code: string;
  name: string;
  reorderThreshold: string | null;
  reorderQuantity: string | null;
  preferredSupplierId: string | null;
  barcode: string | null;
}
interface Supplier {
  id: string;
  name: string;
}
interface PricePoint {
  date: string;
  unitPrice: number;
  supplierName: string;
  source: "order" | "catalog";
}
interface SupplierPrice {
  supplierId: string;
  supplierName: string;
  latestUnitPrice: number;
  latestOrderDate: string;
  averageUnitPrice: number;
  orderCount: number;
}

export function WarehouseReorderSettings() {
  const t = useTranslations("warehouses");
  const tc = useTranslations("common");

  const [materials, setMaterials] = useState<MaterialCatalogItem[] | null>(null);
  const canSeeSuppliers = useCan()("purchasing.view");
  const { data: suppliers = [] } = useApi<Supplier[]>(canSeeSuppliers ? "/materials/suppliers" : null);
  const [drafts, setDrafts] = useState<Record<string, { reorderThreshold: string; reorderQuantity: string; preferredSupplierId: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [priceHistory, setPriceHistory] = useState<PricePoint[] | null>(null);
  const [supplierPrices, setSupplierPrices] = useState<SupplierPrice[] | null>(null);
  const [barcodeDraft, setBarcodeDraft] = useState("");
  const [barcodeSaving, setBarcodeSaving] = useState(false);

  function load() {
    apiFetch<MaterialCatalogItem[]>("/materials/catalog").then((items) => {
      setMaterials(items);
      setDrafts((prev) => {
        const next = { ...prev };
        for (const item of items) {
          if (!next[item.id]) {
            next[item.id] = {
              reorderThreshold: item.reorderThreshold ?? "",
              reorderQuantity: item.reorderQuantity ?? "",
              preferredSupplierId: item.preferredSupplierId ?? "",
            };
          }
        }
        return next;
      });
    });
  }

  useEffect(() => {
    load();
  }, []);

  async function save(materialId: string) {
    const draft = drafts[materialId];
    if (!draft) return;
    setSavingId(materialId);
    setSavedId(null);
    try {
      await apiFetch(`/materials/catalog/${materialId}/reorder-settings`, {
        method: "PATCH",
        body: JSON.stringify({
          reorderThreshold: draft.reorderThreshold === "" ? null : Number(draft.reorderThreshold),
          reorderQuantity: draft.reorderQuantity === "" ? null : Number(draft.reorderQuantity),
          preferredSupplierId: draft.preferredSupplierId || null,
        }),
      });
      setSavedId(materialId);
      load();
    } finally {
      setSavingId(null);
    }
  }

  async function toggleExpand(materialId: string, currentBarcode: string | null) {
    if (expandedId === materialId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(materialId);
    setPriceHistory(null);
    setSupplierPrices(null);
    setBarcodeDraft(currentBarcode ?? "");
    apiFetch<PricePoint[]>(`/materials/catalog/${materialId}/price-history`).then(setPriceHistory);
    apiFetch<SupplierPrice[]>(`/materials/catalog/${materialId}/supplier-prices`).then(setSupplierPrices);
  }

  async function saveBarcode(materialId: string) {
    setBarcodeSaving(true);
    try {
      await apiFetch(`/materials/catalog/${materialId}/barcode`, {
        method: "PATCH",
        body: JSON.stringify({ barcode: barcodeDraft || null }),
      });
      load();
    } finally {
      setBarcodeSaving(false);
    }
  }

  if (!materials || materials.length === 0) return null;

  return (
    <div className="mt-10">
      <h2 className="mb-3 text-sm font-semibold text-fg-muted">{t("reorderSettings")}</h2>
      <p className="mb-3 text-xs text-fg-subtle">{t("reorderSettingsHint")}</p>
      <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-fg-subtle">
            <th className="py-2">{t("material")}</th>
            <th>{t("reorderThreshold")}</th>
            <th>{t("reorderQuantity")}</th>
            <th>{t("preferredSupplier")}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {materials.map((m) => {
            const draft = drafts[m.id] ?? { reorderThreshold: "", reorderQuantity: "", preferredSupplierId: "" };
            return (
              <Fragment key={m.id}>
              <tr className="border-b border-gray-100 dark:border-gray-700">
                <td className="py-2">
                  <button type="button" onClick={() => toggleExpand(m.id, m.barcode)} className="text-left hover:underline">
                    {m.name} ({m.code})
                  </button>
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    className="input w-24"
                    value={draft.reorderThreshold}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [m.id]: { ...draft, reorderThreshold: e.target.value } }))
                    }
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    className="input w-24"
                    value={draft.reorderQuantity}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [m.id]: { ...draft, reorderQuantity: e.target.value } }))
                    }
                  />
                </td>
                <td>
                  <select
                    className="input w-auto"
                    value={draft.preferredSupplierId}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [m.id]: { ...draft, preferredSupplierId: e.target.value } }))
                    }
                  >
                    <option value="">{t("noSupplier")}</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <button onClick={() => save(m.id)} disabled={savingId === m.id} className="btn-secondary px-3 py-1 text-xs">
                    {tc("save")}
                  </button>
                  {savedId === m.id && <span className="ml-2 text-xs text-success-fg">{tc("saved")}</span>}
                </td>
              </tr>
              {expandedId === m.id && (
                <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700">
                  <td colSpan={5} className="py-3">
                    <div className="mb-4 flex items-end gap-2">
                      <label className="flex flex-col gap-1 text-xs text-fg-subtle">
                        {t("barcode")}
                        <input className="input w-40" value={barcodeDraft} onChange={(e) => setBarcodeDraft(e.target.value)} />
                      </label>
                      <button onClick={() => saveBarcode(m.id)} disabled={barcodeSaving} className="btn-secondary px-2.5 py-1 text-xs">
                        {tc("save")}
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                      <div>
                        <div className="mb-2 text-xs font-semibold text-fg-subtle">{t("priceHistory")}</div>
                        {!priceHistory ? (
                          <p className="text-xs text-fg-subtle">{tc("loading")}</p>
                        ) : priceHistory.length <= 1 ? (
                          <p className="text-xs text-fg-subtle">{t("noPriceHistory")}</p>
                        ) : (
                          <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <tbody>
                              {priceHistory.map((p, i) => (
                                <tr key={i} className="border-b border-gray-200 dark:border-gray-700">
                                  <td className="py-1 text-fg-subtle">
                                    {p.source === "catalog" ? t("currentPrice") : formatDate(new Date(p.date))}
                                  </td>
                                  <td className="text-fg-subtle">{p.supplierName}</td>
                                  <td className="text-right font-medium">{p.unitPrice}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="mb-2 text-xs font-semibold text-fg-subtle">{t("supplierComparison")}</div>
                        {!supplierPrices ? (
                          <p className="text-xs text-fg-subtle">{tc("loading")}</p>
                        ) : supplierPrices.length === 0 ? (
                          <p className="text-xs text-fg-subtle">{t("noSupplierPrices")}</p>
                        ) : (
                          <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-left text-fg-subtle">
                                <th className="py-1 font-normal">{tc("name")}</th>
                                <th className="font-normal">{t("latestPrice")}</th>
                                <th className="font-normal">{t("avgPrice")}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {supplierPrices.map((s, i) => (
                                <tr key={s.supplierId} className="border-b border-gray-200 dark:border-gray-700">
                                  <td className={`py-1 ${i === 0 ? "font-medium text-success-fg" : "text-fg-muted"}`}>
                                    {s.supplierName}
                                  </td>
                                  <td className={i === 0 ? "font-medium text-success-fg" : "text-fg-muted"}>
                                    {s.latestUnitPrice}
                                  </td>
                                  <td className="text-fg-subtle">{s.averageUnitPrice}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}
