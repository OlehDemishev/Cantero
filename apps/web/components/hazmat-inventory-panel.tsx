"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";

interface HazardousMaterial {
  id: string;
  name: string;
}
interface InventoryItem {
  id: string;
  quantity: string | null;
  location: string | null;
  hazardousMaterial: HazardousMaterial;
}

export function HazmatInventoryPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("hazmat");

  const [items, setItems] = useState<InventoryItem[] | null>(null);
  const [materials, setMaterials] = useState<HazardousMaterial[]>([]);
  const [form, setForm] = useState({ hazardousMaterialId: "", quantity: "", location: "" });
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<InventoryItem[]>(`/projects/${projectId}/hazmat-inventory`).then(setItems);
  }
  useEffect(load, [projectId]);
  useEffect(() => {
    apiFetch<HazardousMaterial[]>("/hazmat/materials").then((list) => {
      setMaterials(list);
      if (list[0]) setForm((f) => ({ ...f, hazardousMaterialId: f.hazardousMaterialId || list[0].id }));
    });
  }, []);

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!form.hazardousMaterialId) return;
    setBusy(true);
    try {
      await apiFetch(`/projects/${projectId}/hazmat-inventory`, {
        method: "POST",
        body: JSON.stringify({ hazardousMaterialId: form.hazardousMaterialId, quantity: form.quantity || undefined, location: form.location || undefined }),
      });
      setForm((f) => ({ ...f, quantity: "", location: "" }));
      load();
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(id: string) {
    setBusy(true);
    try {
      await apiFetch(`/hazmat-inventory/${id}`, { method: "DELETE" });
      load();
    } finally {
      setBusy(false);
    }
  }

  if (materials.length === 0) return null;

  return (
    <div className="mt-10">
      <h2 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("inventoryTitle")}</h2>
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{t("inventoryHint")}</p>

      {!items ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">—</p>
      ) : items.length === 0 ? (
        <p className="mb-3 text-sm text-gray-400 dark:text-gray-500">{t("noInventory")}</p>
      ) : (
        <ul className="mb-3 flex flex-col gap-1.5">
          {items.map((item) => (
            <li key={item.id} className="card flex items-center justify-between text-sm">
              <span>
                <Link href={`/hazmat?materialId=${item.hazardousMaterial.id}`} className="text-brand-700 dark:text-brand-400 hover:underline">
                  {item.hazardousMaterial.name}
                </Link>
                {item.quantity && <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500">{item.quantity}</span>}
                {item.location && <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500">— {item.location}</span>}
              </span>
              <button onClick={() => removeItem(item.id)} disabled={busy} className="text-xs text-error-700 dark:text-error-500 hover:underline">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={addItem} className="flex flex-wrap items-end gap-2">
        <select className="input" value={form.hazardousMaterialId} onChange={(e) => setForm((f) => ({ ...f, hazardousMaterialId: e.target.value }))}>
          {materials.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <input
          placeholder={t("quantityPlaceholder")}
          className="input w-auto"
          value={form.quantity}
          onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
        />
        <input
          placeholder={t("locationPlaceholder")}
          className="input w-auto"
          value={form.location}
          onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
        />
        <button type="submit" disabled={busy} className="btn-secondary shrink-0 px-2.5 py-1 text-xs">
          {t("addToInventory")}
        </button>
      </form>
    </div>
  );
}
