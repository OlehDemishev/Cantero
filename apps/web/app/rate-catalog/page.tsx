"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { CsvImportButton } from "@/components/csv-import-button";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";

interface MaterialCatalogItem {
  id: string;
  code: string;
  name: string;
  unit: string;
  defaultUnitPrice: string;
}
interface RateCatalogItem {
  id: string;
  code: string;
  name: string;
  unit: string;
  laborHoursPerUnit: string;
  materials: { materialCatalogItem: MaterialCatalogItem; quantityPerUnit: string; wasteFactorPercent: string }[];
}

interface MaterialLine {
  materialCatalogItemId: string;
  quantityPerUnit: string;
  wasteFactorPercent: string;
}

export default function RateCatalogPage() {
  const t = useTranslations("rateCatalog");
  const tc = useTranslations("common");
  const ti = useTranslations("import");
  const { data: me } = useMe();

  const [items, setItems] = useState<RateCatalogItem[] | null>(null);
  const [materials, setMaterials] = useState<MaterialCatalogItem[]>([]);
  const [form, setForm] = useState({ code: "", name: "", unit: "", laborHoursPerUnit: "0.5" });
  const [lines, setLines] = useState<MaterialLine[]>([]);
  const [submitting, setSubmitting] = useState(false);

  function load() {
    apiFetch<RateCatalogItem[]>("/estimates/rate-catalog").then(setItems);
  }

  function loadMaterials() {
    apiFetch<MaterialCatalogItem[]>("/materials/catalog").then(setMaterials);
  }

  useEffect(() => {
    load();
    loadMaterials();
  }, []);

  function addLine() {
    if (materials.length === 0) return;
    setLines((l) => [...l, { materialCatalogItemId: materials[0].id, quantityPerUnit: "1", wasteFactorPercent: "0" }]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch("/estimates/rate-catalog", {
        method: "POST",
        body: JSON.stringify({
          code: form.code,
          name: form.name,
          unit: form.unit,
          laborHoursPerUnit: Number(form.laborHoursPerUnit),
          materials: lines.map((l) => ({
            materialCatalogItemId: l.materialCatalogItemId,
            quantityPerUnit: Number(l.quantityPerUnit),
            wasteFactorPercent: Number(l.wasteFactorPercent),
          })),
        }),
      });
      setForm({ code: "", name: "", unit: "", laborHoursPerUnit: "0.5" });
      setLines([]);
      load();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthenticatedShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <div className="flex flex-wrap gap-2">
          <CsvImportButton endpoint="/materials/catalog/import" label={ti("importMaterials")} onDone={loadMaterials} />
          <CsvImportButton endpoint="/estimates/rate-catalog/import" label={ti("importRateItems")} onDone={load} />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="card lg:col-span-1">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">{tc("create")}</h2>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              required
              placeholder={t("code")}
              className="input"
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
            />
            <input
              required
              placeholder={tc("name")}
              className="input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <input
              required
              placeholder={t("unit")}
              className="input"
              value={form.unit}
              onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
            />
            <label className="text-xs text-gray-500">
              {t("laborHours")}
              <input
                required
                type="number"
                step="0.01"
                className="input mt-1"
                value={form.laborHoursPerUnit}
                onChange={(e) => setForm((f) => ({ ...f, laborHoursPerUnit: e.target.value }))}
              />
            </label>

            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500">{t("materials")}</span>
              <button type="button" onClick={addLine} className="btn-secondary px-2 py-1 text-xs">
                +
              </button>
            </div>
            {lines.map((line, i) => (
              <div key={i} className="flex gap-2">
                <select
                  className="input"
                  value={line.materialCatalogItemId}
                  onChange={(e) =>
                    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, materialCatalogItemId: e.target.value } : l)))
                  }
                >
                  {materials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.code}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  step="0.001"
                  className="input w-24"
                  value={line.quantityPerUnit}
                  onChange={(e) =>
                    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, quantityPerUnit: e.target.value } : l)))
                  }
                />
              </div>
            ))}

            <button type="submit" disabled={submitting} className="btn-primary mt-2">
              {tc("create")}
            </button>
          </form>
        </div>

        <div className="lg:col-span-2">
          {!items ? (
            <p className="text-gray-500">{tc("loading")}</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2">{t("code")}</th>
                  <th>{tc("name")}</th>
                  <th>{t("unit")}</th>
                  <th>{t("laborHours")}</th>
                  <th>{t("materials")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-gray-100">
                    <td className="py-2 font-mono text-xs">{item.code}</td>
                    <td>{item.name}</td>
                    <td>{item.unit}</td>
                    <td>{item.laborHoursPerUnit}</td>
                    <td className="text-xs text-gray-500">
                      {item.materials.map((m) => m.materialCatalogItem.code).join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AuthenticatedShell>
  );
}
