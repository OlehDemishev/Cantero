"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";

interface MaterialCatalogItem {
  id: string;
  code: string;
  name: string;
  unit: string;
}
interface StockKitComponent {
  quantityPerKit: string;
  materialCatalogItem: MaterialCatalogItem;
}
interface StockKit {
  id: string;
  name: string;
  kitMaterialCatalogItem: MaterialCatalogItem;
  components: StockKitComponent[];
}
interface DraftComponent {
  materialCatalogItemId: string;
  quantityPerKit: string;
}

export function StockKits() {
  const t = useTranslations("stockKits");
  const tc = useTranslations("common");

  const [kits, setKits] = useState<StockKit[] | null>(null);
  const [materials, setMaterials] = useState<MaterialCatalogItem[]>([]);
  const [form, setForm] = useState({ kitMaterialCatalogItemId: "", name: "" });
  const [components, setComponents] = useState<DraftComponent[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<StockKit[]>("/materials/stock-kits").then(setKits);
  }

  useEffect(() => {
    load();
    apiFetch<MaterialCatalogItem[]>("/materials/catalog").then((items) => {
      setMaterials(items);
      if (items[0]) {
        setForm((f) => ({ ...f, kitMaterialCatalogItemId: items[0].id }));
        setComponents([{ materialCatalogItemId: items[0].id, quantityPerKit: "1" }]);
      }
    });
  }, []);

  function addComponent() {
    if (!materials[0]) return;
    setComponents((c) => [...c, { materialCatalogItemId: materials[0].id, quantityPerKit: "1" }]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (components.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/materials/stock-kits", {
        method: "POST",
        body: JSON.stringify({
          kitMaterialCatalogItemId: form.kitMaterialCatalogItemId,
          name: form.name,
          components: components.map((c) => ({
            materialCatalogItemId: c.materialCatalogItemId,
            quantityPerKit: Number(c.quantityPerKit),
          })),
        }),
      });
      setForm((f) => ({ ...f, name: "" }));
      setComponents(materials[0] ? [{ materialCatalogItemId: materials[0].id, quantityPerKit: "1" }] : []);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : tc("error"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await apiFetch(`/materials/stock-kits/${id}`, { method: "DELETE" });
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("newKit")}</h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 max-w-lg">
        <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
          {t("kitItem")}
          <select
            className="input"
            value={form.kitMaterialCatalogItemId}
            onChange={(e) => setForm((f) => ({ ...f, kitMaterialCatalogItemId: e.target.value }))}
          >
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.code})
              </option>
            ))}
          </select>
        </label>
        <input
          required
          placeholder={tc("name")}
          className="input"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />

        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t("components")}</p>
        {components.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <select
              className="input"
              value={c.materialCatalogItemId}
              onChange={(e) =>
                setComponents((cs) => cs.map((x, idx) => (idx === i ? { ...x, materialCatalogItemId: e.target.value } : x)))
              }
            >
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.code})
                </option>
              ))}
            </select>
            <input
              type="number"
              step="0.000001"
              className="input w-24"
              value={c.quantityPerKit}
              onChange={(e) =>
                setComponents((cs) => cs.map((x, idx) => (idx === i ? { ...x, quantityPerKit: e.target.value } : x)))
              }
            />
            <button
              type="button"
              onClick={() => setComponents((cs) => cs.filter((_, idx) => idx !== i))}
              className="text-xs text-error-700 dark:text-error-500"
            >
              {tc("delete")}
            </button>
          </div>
        ))}
        <button type="button" onClick={addComponent} className="btn-secondary self-start px-3 py-1 text-xs">
          {t("addComponent")}
        </button>
        <button type="submit" disabled={busy || components.length === 0} className="btn-primary">
          {tc("create")}
        </button>
      </form>
      {error && <p className="mt-2 text-xs text-error-600">{error}</p>}

      <div className="mt-8">
        {!kits ? (
          <p className="text-gray-500 dark:text-gray-400">{tc("loading")}</p>
        ) : kits.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">{t("noKits")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {kits.map((k) => (
              <li key={k.id} className="card">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium">{k.name}</span>
                    <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                      → {k.kitMaterialCatalogItem.name} ({k.kitMaterialCatalogItem.code})
                    </span>
                  </div>
                  <button onClick={() => remove(k.id)} disabled={busy} className="text-xs text-error-700 dark:text-error-500 hover:underline">
                    {tc("delete")}
                  </button>
                </div>
                <ul className="mt-2 flex flex-col gap-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {k.components.map((c, i) => (
                    <li key={i}>
                      {c.quantityPerKit} × {c.materialCatalogItem.name}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
