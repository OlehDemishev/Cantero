"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";

interface RateCatalogItem {
  id: string;
  code: string;
  name: string;
  unit: string;
}
interface AssemblyItem {
  rateCatalogItem: RateCatalogItem;
  quantityPerUnit: string;
}
interface Assembly {
  id: string;
  code: string;
  name: string;
  unit: string;
  items: AssemblyItem[];
}
interface DraftLine {
  rateCatalogItemId: string;
  quantityPerUnit: string;
}

export function AssembliesPanel() {
  const t = useTranslations("assemblies");
  const tc = useTranslations("common");

  const [assemblies, setAssemblies] = useState<Assembly[] | null>(null);
  const [rateItems, setRateItems] = useState<RateCatalogItem[]>([]);
  const [form, setForm] = useState({ code: "", name: "", unit: "" });
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<Assembly[]>("/assemblies").then(setAssemblies);
  }

  useEffect(() => {
    load();
    apiFetch<RateCatalogItem[]>("/estimates/rate-catalog").then((items) => {
      setRateItems(items);
      if (items[0]) setDraftLines([{ rateCatalogItemId: items[0].id, quantityPerUnit: "1" }]);
    });
  }, []);

  function addDraftLine() {
    if (!rateItems[0]) return;
    setDraftLines((lines) => [...lines, { rateCatalogItemId: rateItems[0].id, quantityPerUnit: "1" }]);
  }

  function removeDraftLine(index: number) {
    setDraftLines((lines) => lines.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (draftLines.length === 0) return;
    setBusy(true);
    try {
      await apiFetch("/assemblies", {
        method: "POST",
        body: JSON.stringify({
          code: form.code,
          name: form.name,
          unit: form.unit,
          items: draftLines.map((l) => ({ rateCatalogItemId: l.rateCatalogItemId, quantityPerUnit: Number(l.quantityPerUnit) })),
        }),
      });
      setForm({ code: "", name: "", unit: "" });
      setDraftLines(rateItems[0] ? [{ rateCatalogItemId: rateItems[0].id, quantityPerUnit: "1" }] : []);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm(tc("confirmDelete") ?? "")) return;
    setBusy(true);
    try {
      await apiFetch(`/assemblies/${id}`, { method: "DELETE" });
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-10">
      <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("title")}</h2>
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">{t("hint")}</p>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="card lg:col-span-1">
          <h3 className="mb-3 text-xs font-semibold text-gray-500 dark:text-gray-400">{t("newAssembly")}</h3>
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
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t("items")}</p>
            {draftLines.map((line, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  className="input"
                  value={line.rateCatalogItemId}
                  onChange={(e) =>
                    setDraftLines((lines) => lines.map((l, idx) => (idx === i ? { ...l, rateCatalogItemId: e.target.value } : l)))
                  }
                >
                  {rateItems.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  step="0.01"
                  className="input w-20"
                  value={line.quantityPerUnit}
                  onChange={(e) =>
                    setDraftLines((lines) => lines.map((l, idx) => (idx === i ? { ...l, quantityPerUnit: e.target.value } : l)))
                  }
                />
                <button type="button" onClick={() => removeDraftLine(i)} className="text-xs text-error-700 dark:text-error-500">
                  {tc("delete")}
                </button>
              </div>
            ))}
            <button type="button" onClick={addDraftLine} className="btn-secondary self-start px-3 py-1 text-xs">
              {t("addItem")}
            </button>
            <button type="submit" disabled={busy || draftLines.length === 0} className="btn-primary">
              {tc("create")}
            </button>
          </form>
        </div>

        <div className="lg:col-span-2">
          {!assemblies ? (
            <p className="text-gray-500 dark:text-gray-400">{tc("loading")}</p>
          ) : assemblies.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">—</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {assemblies.map((a) => (
                <li key={a.id} className="card">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium">{a.name}</span>
                      <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                        {a.code} · {a.unit}
                      </span>
                    </div>
                    <button onClick={() => remove(a.id)} disabled={busy} className="text-xs text-error-700 dark:text-error-500 hover:underline">
                      {tc("delete")}
                    </button>
                  </div>
                  <ul className="mt-2 flex flex-col gap-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {a.items.map((item, i) => (
                      <li key={i}>
                        {item.quantityPerUnit} × {item.rateCatalogItem.name}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
