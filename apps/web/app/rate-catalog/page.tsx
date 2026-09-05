"use client";

import { Fragment, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { CsvImportButton } from "@/components/csv-import-button";
import { AssembliesPanel } from "@/components/assemblies-panel";
import { EstimateAccuracyPanel } from "@/components/estimate-accuracy-panel";
import { MaterialPricesPanel } from "@/components/material-prices-panel";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";
import { formatDate, formatDateTime } from "@/lib/format-date";

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
  catalogId: string | null;
  formula: string | null;
  formulaParams: string[];
  materials: { materialCatalogItem: MaterialCatalogItem; quantityPerUnit: string; wasteFactorPercent: string }[];
}
interface Catalog {
  id: string;
  name: string;
}
interface Revision {
  id: string;
  code: string;
  name: string;
  unit: string;
  laborHoursPerUnit: string;
  changedByName: string;
  createdAt: string;
}
interface PendingChange {
  id: string;
  laborHoursPerUnit: string | null;
  name: string | null;
  unit: string | null;
  proposedByName: string;
  proposedAt: string;
  rateCatalogItem: { id: string; code: string; name: string; laborHoursPerUnit: string };
}

interface MaterialLine {
  materialCatalogItemId: string;
  quantityPerUnit: string;
  wasteFactorPercent: string;
}

const EMPTY_FORM = { code: "", name: "", unit: "", laborHoursPerUnit: "0.5", catalogId: "", formula: "", formulaParams: "" };

export default function RateCatalogPage() {
  const t = useTranslations("rateCatalog");
  const tc = useTranslations("common");
  const ti = useTranslations("import");
  const { data: me } = useMe();

  const [items, setItems] = useState<RateCatalogItem[] | null>(null);
  const [materials, setMaterials] = useState<MaterialCatalogItem[]>([]);
  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [activeCatalogId, setActiveCatalogId] = useState<string>("all");
  const [newCatalogName, setNewCatalogName] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [lines, setLines] = useState<MaterialLine[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [historyForId, setHistoryForId] = useState<string | null>(null);
  const [history, setHistory] = useState<Revision[] | null>(null);
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);
  const [pendingNotice, setPendingNotice] = useState<string | null>(null);

  function load() {
    apiFetch<RateCatalogItem[]>("/estimates/rate-catalog").then(setItems);
    apiFetch<PendingChange[]>("/estimates/rate-catalog/pending-changes").then(setPendingChanges);
  }

  function loadMaterials() {
    apiFetch<MaterialCatalogItem[]>("/materials/catalog").then(setMaterials);
  }

  function loadCatalogs() {
    apiFetch<Catalog[]>("/catalogs").then(setCatalogs);
  }

  useEffect(() => {
    load();
    loadMaterials();
    loadCatalogs();
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
          catalogId: form.catalogId || undefined,
          formula: form.formula || undefined,
          formulaParams: form.formula
            ? form.formulaParams.split(",").map((p) => p.trim()).filter(Boolean)
            : [],
          materials: lines.map((l) => ({
            materialCatalogItemId: l.materialCatalogItemId,
            quantityPerUnit: Number(l.quantityPerUnit),
            wasteFactorPercent: Number(l.wasteFactorPercent),
          })),
        }),
      });
      setForm(EMPTY_FORM);
      setLines([]);
      load();
    } finally {
      setSubmitting(false);
    }
  }

  async function createCatalog(e: React.FormEvent) {
    e.preventDefault();
    if (!newCatalogName.trim()) return;
    await apiFetch("/catalogs", { method: "POST", body: JSON.stringify({ name: newCatalogName.trim() }) });
    setNewCatalogName("");
    loadCatalogs();
  }

  function startEdit(item: RateCatalogItem) {
    setEditingId(item.id);
    setEditForm({
      code: item.code,
      name: item.name,
      unit: item.unit,
      laborHoursPerUnit: item.laborHoursPerUnit,
      catalogId: item.catalogId ?? "",
      formula: item.formula ?? "",
      formulaParams: item.formulaParams.join(", "),
    });
    setHistoryForId(null);
  }

  async function saveEdit(id: string) {
    const result = await apiFetch<{ pendingApproval: boolean }>(`/estimates/rate-catalog/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: editForm.name,
        unit: editForm.unit,
        laborHoursPerUnit: Number(editForm.laborHoursPerUnit),
        catalogId: editForm.catalogId || null,
        formula: editForm.formula || null,
        formulaParams: editForm.formula
          ? editForm.formulaParams.split(",").map((p) => p.trim()).filter(Boolean)
          : [],
      }),
    });
    setPendingNotice(result.pendingApproval ? t("changeHeldForApproval") : null);
    setEditingId(null);
    load();
  }

  async function approvePendingChange(id: string) {
    await apiFetch(`/estimates/rate-catalog/pending-changes/${id}/approve`, { method: "POST", body: JSON.stringify({}) });
    load();
  }

  async function rejectPendingChange(id: string) {
    await apiFetch(`/estimates/rate-catalog/pending-changes/${id}/reject`, { method: "POST", body: JSON.stringify({}) });
    load();
  }

  function toggleHistory(id: string) {
    if (historyForId === id) {
      setHistoryForId(null);
      setHistory(null);
      return;
    }
    setHistoryForId(id);
    setHistory(null);
    apiFetch<Revision[]>(`/estimates/rate-catalog/${id}/history`).then(setHistory);
  }

  const catalogNameById = Object.fromEntries(catalogs.map((c) => [c.id, c.name]));
  const visibleItems = items?.filter((item) => {
    if (activeCatalogId === "all") return true;
    if (activeCatalogId === "uncategorized") return !item.catalogId;
    return item.catalogId === activeCatalogId;
  });

  return (
    <AuthenticatedShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <div className="flex flex-wrap gap-2">
          <CsvImportButton endpoint="/materials/catalog/import" label={ti("importMaterials")} onDone={loadMaterials} />
          <CsvImportButton endpoint="/estimates/rate-catalog/import" label={ti("importRateItems")} onDone={load} />
        </div>
      </div>

      {pendingNotice && (
        <div className="mt-3 flex items-center justify-between rounded-md bg-warning-50 px-3 py-2 text-xs text-warning-700">
          <span>{pendingNotice}</span>
          <button onClick={() => setPendingNotice(null)} className="text-warning-700 hover:underline">
            {tc("close")}
          </button>
        </div>
      )}

      {pendingChanges.length > 0 && (
        <div className="card mt-4">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">{t("pendingChanges")}</h2>
          <p className="mb-3 text-xs text-gray-500">{t("pendingChangesHint")}</p>
          <ul className="flex flex-col gap-2">
            {pendingChanges.map((pc) => (
              <li key={pc.id} className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-sm">
                <div>
                  <span className="font-medium text-gray-900">
                    {pc.rateCatalogItem.code} — {pc.name ?? pc.rateCatalogItem.name}
                  </span>
                  {pc.laborHoursPerUnit !== null && (
                    <span className="ml-2 text-xs text-gray-500">
                      {t("laborHoursChange", { from: pc.rateCatalogItem.laborHoursPerUnit, to: pc.laborHoursPerUnit })}
                    </span>
                  )}
                  <p className="text-xs text-gray-400">{t("proposedBy", { name: pc.proposedByName, date: formatDate(new Date(pc.proposedAt)) })}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => approvePendingChange(pc.id)} className="btn-primary px-2.5 py-1 text-xs">
                    {t("approveChange")}
                  </button>
                  <button onClick={() => rejectPendingChange(pc.id)} className="btn-secondary px-2.5 py-1 text-xs">
                    {t("rejectChange")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setActiveCatalogId("all")}
          className={`rounded-full px-3 py-1 text-xs font-medium ${activeCatalogId === "all" ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-600"}`}
        >
          {t("allCatalogs")}
        </button>
        <button
          onClick={() => setActiveCatalogId("uncategorized")}
          className={`rounded-full px-3 py-1 text-xs font-medium ${activeCatalogId === "uncategorized" ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-600"}`}
        >
          {t("uncategorized")}
        </button>
        {catalogs.map((c) => (
          <button
            key={c.id}
            onClick={() => setActiveCatalogId(c.id)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${activeCatalogId === c.id ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-600"}`}
          >
            {c.name}
          </button>
        ))}
        <form onSubmit={createCatalog} className="flex items-center gap-1">
          <input
            placeholder={t("newCatalogName")}
            className="input w-40 py-1 text-xs"
            value={newCatalogName}
            onChange={(e) => setNewCatalogName(e.target.value)}
          />
          <button type="submit" className="btn-secondary px-2 py-1 text-xs">
            +
          </button>
        </form>
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
            <label className="text-xs text-gray-500">
              {t("catalog")}
              <select
                className="input mt-1"
                value={form.catalogId}
                onChange={(e) => setForm((f) => ({ ...f, catalogId: e.target.value }))}
              >
                <option value="">{t("uncategorized")}</option>
                {catalogs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs text-gray-500">
              {t("formula")}
              <input
                placeholder={t("formulaPlaceholder")}
                className="input mt-1"
                value={form.formula}
                onChange={(e) => setForm((f) => ({ ...f, formula: e.target.value }))}
              />
            </label>
            {form.formula && (
              <label className="text-xs text-gray-500">
                {t("formulaParams")}
                <input
                  placeholder={t("formulaParamsPlaceholder")}
                  className="input mt-1"
                  value={form.formulaParams}
                  onChange={(e) => setForm((f) => ({ ...f, formulaParams: e.target.value }))}
                />
              </label>
            )}

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
          {!visibleItems ? (
            <p className="text-gray-500">{tc("loading")}</p>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2">{t("code")}</th>
                  <th>{tc("name")}</th>
                  <th>{t("unit")}</th>
                  <th>{t("laborHours")}</th>
                  <th>{t("catalog")}</th>
                  <th>{t("materials")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((item) =>
                  editingId === item.id ? (
                    <tr key={item.id} className="border-b border-gray-100 bg-gray-50">
                      <td className="py-2 font-mono text-xs">{item.code}</td>
                      <td>
                        <input className="input py-1 text-xs" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
                      </td>
                      <td>
                        <input className="input w-16 py-1 text-xs" value={editForm.unit} onChange={(e) => setEditForm((f) => ({ ...f, unit: e.target.value }))} />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          className="input w-20 py-1 text-xs"
                          value={editForm.laborHoursPerUnit}
                          onChange={(e) => setEditForm((f) => ({ ...f, laborHoursPerUnit: e.target.value }))}
                        />
                      </td>
                      <td>
                        <select
                          className="input py-1 text-xs"
                          value={editForm.catalogId}
                          onChange={(e) => setEditForm((f) => ({ ...f, catalogId: e.target.value }))}
                        >
                          <option value="">{t("uncategorized")}</option>
                          {catalogs.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td colSpan={2} className="flex flex-wrap items-center gap-1 py-2">
                        <button onClick={() => saveEdit(item.id)} className="btn-primary px-2 py-1 text-xs">
                          {tc("save")}
                        </button>
                        <button onClick={() => setEditingId(null)} className="btn-secondary px-2 py-1 text-xs">
                          {tc("cancel")}
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <Fragment key={item.id}>
                      <tr className="border-b border-gray-100">
                        <td className="py-2 font-mono text-xs">{item.code}</td>
                        <td>
                          {item.name}
                          {item.formula && <span className="ml-1 rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] text-brand-700">ƒ</span>}
                        </td>
                        <td>{item.unit}</td>
                        <td>{item.laborHoursPerUnit}</td>
                        <td className="text-xs text-gray-500">{item.catalogId ? catalogNameById[item.catalogId] : t("uncategorized")}</td>
                        <td className="text-xs text-gray-500">{item.materials.map((m) => m.materialCatalogItem.code).join(", ")}</td>
                        <td className="whitespace-nowrap text-right">
                          <button onClick={() => startEdit(item)} className="text-xs text-brand-700 hover:underline">
                            {tc("edit")}
                          </button>{" "}
                          <button onClick={() => toggleHistory(item.id)} className="text-xs text-brand-700 hover:underline">
                            {t("history")}
                          </button>
                        </td>
                      </tr>
                      {historyForId === item.id && (
                        <tr className="border-b border-gray-100 bg-gray-50">
                          <td colSpan={7} className="py-2">
                            {!history ? (
                              <span className="text-xs text-gray-400">{tc("loading")}</span>
                            ) : history.length === 0 ? (
                              <span className="text-xs text-gray-400">{t("noHistory")}</span>
                            ) : (
                              <ul className="flex flex-col gap-1">
                                {history.map((rev) => (
                                  <li key={rev.id} className="text-xs text-gray-500">
                                    {formatDateTime(new Date(rev.createdAt))} — {rev.name} ({rev.laborHoursPerUnit} {t("laborHours").toLowerCase()}) —{" "}
                                    {rev.changedByName}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ),
                )}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>

      <MaterialPricesPanel />
      <AssembliesPanel />
      <EstimateAccuracyPanel />
    </AuthenticatedShell>
  );
}
