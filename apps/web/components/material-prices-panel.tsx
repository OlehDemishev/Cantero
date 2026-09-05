"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";

interface MaterialCatalogItem {
  id: string;
  code: string;
  name: string;
  unit: string;
  defaultUnitPrice: string;
}
interface PriceChange {
  id: string;
  oldPrice: string;
  newPrice: string;
  changePercent: string;
  changedByName: string;
  createdAt: string;
  materialCatalogItem: { id: string; code: string; name: string };
}
interface AffectedEstimate {
  id: string;
  name: string;
  grandTotal: number;
  project: { id: string; name: string } | null;
}

export function MaterialPricesPanel() {
  const t = useTranslations("materialPrices");
  const tc = useTranslations("common");
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "";

  const [materials, setMaterials] = useState<MaterialCatalogItem[] | null>(null);
  const [changes, setChanges] = useState<PriceChange[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [priceDraft, setPriceDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [affectedFor, setAffectedFor] = useState<string | null>(null);
  const [affected, setAffected] = useState<AffectedEstimate[] | null>(null);

  function load() {
    apiFetch<MaterialCatalogItem[]>("/materials/catalog").then(setMaterials);
    apiFetch<PriceChange[]>("/materials/catalog/price-changes").then(setChanges);
  }

  useEffect(load, []);

  function startEdit(m: MaterialCatalogItem) {
    setEditingId(m.id);
    setPriceDraft(m.defaultUnitPrice);
  }

  async function savePrice(id: string, e: React.FormEvent) {
    e.preventDefault();
    if (!priceDraft) return;
    setBusy(true);
    try {
      await apiFetch(`/materials/catalog/${id}/price`, { method: "PATCH", body: JSON.stringify({ defaultUnitPrice: Number(priceDraft) }) });
      setEditingId(null);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function toggleAffected(materialCatalogItemId: string) {
    if (affectedFor === materialCatalogItemId) {
      setAffectedFor(null);
      setAffected(null);
      return;
    }
    setAffectedFor(materialCatalogItemId);
    const result = await apiFetch<AffectedEstimate[]>(`/materials/catalog/${materialCatalogItemId}/affected-estimates`);
    setAffected(result);
  }

  if (!materials) return null;

  return (
    <div className="mt-8">
      <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("title")}</h2>

      {changes && changes.length > 0 && (
        <div className="card mb-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{t("recentChanges")}</h3>
          <ul className="flex flex-col gap-2">
            {changes.map((c) => {
              const pct = Number(c.changePercent);
              return (
                <li key={c.id} className="text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-900">{c.materialCatalogItem.name}</span>
                    <span className={`text-xs font-medium ${pct > 0 ? "text-error-700" : "text-success-700"}`}>
                      {pct > 0 ? "+" : ""}
                      {pct}% ({c.oldPrice} → {c.newPrice} {currency})
                    </span>
                  </div>
                  <button onClick={() => toggleAffected(c.materialCatalogItem.id)} className="text-xs text-brand-700 hover:underline">
                    {affectedFor === c.materialCatalogItem.id ? tc("close") : t("showAffectedEstimates")}
                  </button>
                  {affectedFor === c.materialCatalogItem.id && (
                    <div className="mt-1 rounded-lg bg-gray-50 p-2">
                      {!affected ? (
                        <p className="text-xs text-gray-400">{tc("loading")}</p>
                      ) : affected.length === 0 ? (
                        <p className="text-xs text-gray-400">{t("noAffectedEstimates")}</p>
                      ) : (
                        <ul className="flex flex-col gap-1">
                          {affected.map((e) => (
                            <li key={e.id} className="text-xs">
                              <a href={`/estimates/${e.id}`} className="text-brand-700 hover:underline">
                                {e.name}
                              </a>
                              {e.project && <span className="text-gray-400"> — {e.project.name}</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="card">
        <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-1.5">{t("code")}</th>
              <th>{tc("name")}</th>
              <th>{t("unit")}</th>
              <th>{t("price")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {materials.map((m) => (
              <tr key={m.id} className="border-b border-gray-100">
                <td className="py-1.5 text-xs text-gray-500">{m.code}</td>
                <td>{m.name}</td>
                <td className="text-xs text-gray-500">{m.unit}</td>
                <td>
                  {editingId === m.id ? (
                    <form onSubmit={(e) => savePrice(m.id, e)} className="flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        step="0.0001"
                        autoFocus
                        className="input w-24 py-0.5 text-xs"
                        value={priceDraft}
                        onChange={(e) => setPriceDraft(e.target.value)}
                      />
                      <button type="submit" disabled={busy} className="btn-secondary px-2 py-0.5 text-xs">
                        {tc("save")}
                      </button>
                      <button type="button" onClick={() => setEditingId(null)} className="text-xs text-gray-400">
                        {tc("cancel")}
                      </button>
                    </form>
                  ) : (
                    <span>
                      {m.defaultUnitPrice} {currency}
                    </span>
                  )}
                </td>
                <td>
                  {editingId !== m.id && (
                    <button onClick={() => startEdit(m)} className="text-xs text-brand-700 hover:underline">
                      {tc("edit")}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
