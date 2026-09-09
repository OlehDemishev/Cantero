"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";

interface MaterialCatalogItem {
  id: string;
  code: string;
  name: string;
  carbonFootprintKgCo2e: string | null;
  greenCertified: boolean;
  greenCertificationBody: string | null;
}

export function WarehouseSustainabilitySettings() {
  const t = useTranslations("warehouses");
  const tc = useTranslations("common");
  const ts = useTranslations("sustainability");

  const [materials, setMaterials] = useState<MaterialCatalogItem[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { carbonFootprintKgCo2e: string; greenCertified: boolean; greenCertificationBody: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  function load() {
    apiFetch<MaterialCatalogItem[]>("/materials/catalog").then((items) => {
      setMaterials(items);
      setDrafts((prev) => {
        const next = { ...prev };
        for (const item of items) {
          if (!next[item.id]) {
            next[item.id] = {
              carbonFootprintKgCo2e: item.carbonFootprintKgCo2e ?? "",
              greenCertified: item.greenCertified,
              greenCertificationBody: item.greenCertificationBody ?? "",
            };
          }
        }
        return next;
      });
    });
  }

  useEffect(load, []);

  async function save(materialId: string) {
    const draft = drafts[materialId];
    if (!draft) return;
    setSavingId(materialId);
    setSavedId(null);
    try {
      await apiFetch(`/materials/catalog/${materialId}/sustainability`, {
        method: "PATCH",
        body: JSON.stringify({
          carbonFootprintKgCo2e: draft.carbonFootprintKgCo2e === "" ? null : Number(draft.carbonFootprintKgCo2e),
          greenCertified: draft.greenCertified,
          greenCertificationBody: draft.greenCertificationBody || null,
        }),
      });
      setSavedId(materialId);
      load();
    } finally {
      setSavingId(null);
    }
  }

  if (!materials || materials.length === 0) return null;

  return (
    <div className="mt-10">
      <h2 className="mb-3 text-sm font-semibold text-gray-700">{ts("materialSettings")}</h2>
      <p className="mb-3 text-xs text-gray-500">{ts("materialSettingsHint")}</p>
      <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-gray-500">
            <th className="py-2">{t("material")}</th>
            <th>{ts("carbonFootprint")}</th>
            <th>{ts("greenCertified")}</th>
            <th>{ts("greenCertificationBody")}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {materials.map((m) => {
            const draft = drafts[m.id] ?? { carbonFootprintKgCo2e: "", greenCertified: false, greenCertificationBody: "" };
            return (
              <tr key={m.id} className="border-b border-gray-100">
                <td className="py-2">
                  {m.name} ({m.code})
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="input w-28"
                    value={draft.carbonFootprintKgCo2e}
                    onChange={(e) => setDrafts((d) => ({ ...d, [m.id]: { ...draft, carbonFootprintKgCo2e: e.target.value } }))}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={draft.greenCertified}
                    onChange={(e) => setDrafts((d) => ({ ...d, [m.id]: { ...draft, greenCertified: e.target.checked } }))}
                  />
                </td>
                <td>
                  <input
                    className="input w-32"
                    placeholder={ts("greenCertificationBodyPlaceholder")}
                    value={draft.greenCertificationBody}
                    onChange={(e) => setDrafts((d) => ({ ...d, [m.id]: { ...draft, greenCertificationBody: e.target.value } }))}
                  />
                </td>
                <td className="whitespace-nowrap">
                  <button onClick={() => save(m.id)} disabled={savingId === m.id} className="btn-secondary px-2 py-1 text-xs">
                    {tc("save")}
                  </button>
                  {savedId === m.id && <span className="ml-2 text-xs text-success-700">{tc("saved")}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}
