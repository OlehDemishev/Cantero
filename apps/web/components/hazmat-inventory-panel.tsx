"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfirm } from "@/components/ui/confirm-dialog";

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
  const confirm = useConfirm();
  const td = useTranslations("dialog");

  const { data: items = null, reload: reloadItems, error: itemsError } = useApi<InventoryItem[]>(`/projects/${projectId}/hazmat-inventory`);
  const [materials, setMaterials] = useState<HazardousMaterial[]>([]);
  const [form, setForm] = useState({ hazardousMaterialId: "", quantity: "", location: "" });
  const [busy, setBusy] = useState(false);

  function load() {
    void reloadItems();
  }
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
    if (!(await confirm({ message: td("deleteHazmatItem"), tone: "danger", verb: "delete" }))) return;
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
      <h2 className="mb-1 text-sm font-semibold text-fg-muted">{t("inventoryTitle")}</h2>
      <p className="mb-3 text-xs text-fg-subtle">{t("inventoryHint")}</p>

      {!items ? (
        itemsError ? <ErrorState error={itemsError} onRetry={reloadItems} compact /> : <Skeleton lines={3} />
      ) : items.length === 0 ? (
        <p className="mb-3 text-sm text-fg-subtle">{t("noInventory")}</p>
      ) : (
        <ul className="mb-3 flex flex-col gap-1.5">
          {items.map((item) => (
            <li key={item.id} className="card flex items-center justify-between text-sm">
              <span>
                <Link href={`/hazmat?materialId=${item.hazardousMaterial.id}`} className="text-brand-700 dark:text-brand-400 hover:underline">
                  {item.hazardousMaterial.name}
                </Link>
                {item.quantity && <span className="ml-1.5 text-xs text-fg-subtle">{item.quantity}</span>}
                {item.location && <span className="ml-1.5 text-xs text-fg-subtle">— {item.location}</span>}
              </span>
              <button onClick={() => removeItem(item.id)} disabled={busy} className="text-xs text-danger-fg hover:underline">
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
