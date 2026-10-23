"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { submitOrQueue } from "@/lib/offline-queue";
import { fetchCached } from "@/lib/offline-cache";
import { FieldMessage, type FieldMessageType } from "@/components/field-message";
import { Field } from "@/components/ui/field";

interface Warehouse {
  id: string;
  name: string;
}
interface MaterialCatalogItem {
  id: string;
  code: string;
  name: string;
  unit: string;
}

export function StockTab({ projectId }: { projectId: string }) {
  const t = useTranslations("field");
  const tw = useTranslations("warehouses");
  const tc = useTranslations("common");
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [materials, setMaterials] = useState<MaterialCatalogItem[]>([]);
  const [form, setForm] = useState({ warehouseId: "", materialCatalogItemId: "", quantity: "1", type: "issue" as "issue" | "receipt" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: FieldMessageType; text: string } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetchCached<Warehouse[]>("field:warehouses", "/materials/warehouses")
      .then(({ data: list }) => {
        setWarehouses(list);
        setForm((f) => ({ ...f, warehouseId: list[0]?.id ?? "" }));
      })
      .catch(() => setError(true));
    fetchCached<MaterialCatalogItem[]>("field:materials", "/materials/catalog")
      .then(({ data: list }) => {
        setMaterials(list);
        setForm((f) => ({ ...f, materialCatalogItemId: list[0]?.id ?? "" }));
      })
      .catch(() => setError(true));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.warehouseId || !form.materialCatalogItemId) return;
    setBusy(true);
    setMessage(null);
    try {
      const { queued } = await submitOrQueue("stock-movement", "/materials/stock/movements", "POST", {
        warehouseId: form.warehouseId,
        materialCatalogItemId: form.materialCatalogItemId,
        type: form.type,
        quantity: Number(form.quantity),
        projectId,
      });
      setMessage({ type: "success", text: queued ? t("queuedOffline") : tc("saved") });
      setForm((f) => ({ ...f, quantity: "1" }));
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : tc("error") });
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="text-sm text-fg-subtle">{t("offline")}</p>;
  if (warehouses.length === 0 || materials.length === 0) return <p className="text-sm text-fg-subtle">{tc("loading")}</p>;

  return (
    <form onSubmit={submit} className="card flex flex-col gap-3">
      <Field label={tw("title")}>
        <select
          className="input"
          value={form.warehouseId}
          onChange={(e) => setForm((f) => ({ ...f, warehouseId: e.target.value }))}
        >
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label={tw("material")}>
        <select
          className="input"
          value={form.materialCatalogItemId}
          onChange={(e) => setForm((f) => ({ ...f, materialCatalogItemId: e.target.value }))}
        >
          {materials.map((m) => (
            <option key={m.id} value={m.id}>
              {m.code} — {m.name} ({m.unit})
            </option>
          ))}
        </select>
      </Field>
      <div className="flex gap-3">
        <Field label={tw("type")} className="flex-1">
          <select
            className="input"
            value={form.type}
            onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as "issue" | "receipt" }))}
          >
            <option value="issue">{tw("issue")}</option>
            <option value="receipt">{tw("receipt")}</option>
          </select>
        </Field>
        <Field label={t("quantity")} className="flex-1">
          <input
            type="number"
            step="0.01"
            min="0.01"
            className="input"
            value={form.quantity}
            onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
          />
        </Field>
      </div>
      <button type="submit" disabled={busy} className="btn-primary mt-1">
        {t("issueStockButton")}
      </button>
      {message && <FieldMessage type={message.type} text={message.text} />}
    </form>
  );
}
