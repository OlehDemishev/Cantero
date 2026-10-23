"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, notifyApiError } from "@/lib/api-client";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/lib/use-api";
import { FormError } from "@/components/ui/field";

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
  const confirm = useConfirm();
  const td = useTranslations("dialog");
  const tc = useTranslations("common");

  const { data: kits = null, error: kitsError, reload: reloadKits } = useApi<StockKit[]>("/materials/stock-kits");
  const [materials, setMaterials] = useState<MaterialCatalogItem[]>([]);
  const [form, setForm] = useState({ kitMaterialCatalogItemId: "", name: "" });
  const [components, setComponents] = useState<DraftComponent[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    void reloadKits();
  }

  useEffect(() => {
    apiFetch<MaterialCatalogItem[]>("/materials/catalog").then((items) => {
      setMaterials(items);
      if (items[0]) {
        setForm((f) => ({ ...f, kitMaterialCatalogItemId: items[0].id }));
        setComponents([{ materialCatalogItemId: items[0].id, quantityPerKit: "1" }]);
      }
    }).catch(notifyApiError);
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
    if (!(await confirm({ message: td("deleteStockKit"), tone: "danger", verb: "delete" }))) return;
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
      <h2 className="mb-3 text-sm font-semibold text-fg-muted">{t("newKit")}</h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 max-w-lg">
        <label className="flex flex-col gap-1 text-xs text-fg-subtle">
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

        <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t("components")}</p>
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
              className="text-xs text-danger-fg"
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
      {error && <FormError className="mt-2">{error}</FormError>}

      <div className="mt-8">
        {!kits ? (
          kitsError ? <ErrorState error={kitsError} onRetry={reloadKits} compact /> : <Skeleton lines={3} />
        ) : kits.length === 0 ? (
          <p className="text-sm text-fg-subtle">{t("noKits")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {kits.map((k) => (
              <li key={k.id} className="card">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium">{k.name}</span>
                    <span className="ml-2 text-xs text-fg-subtle">
                      → {k.kitMaterialCatalogItem.name} ({k.kitMaterialCatalogItem.code})
                    </span>
                  </div>
                  <button onClick={() => remove(k.id)} disabled={busy} className="text-xs text-danger-fg hover:underline">
                    {tc("delete")}
                  </button>
                </div>
                <ul className="mt-2 flex flex-col gap-0.5 text-xs text-fg-subtle">
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
