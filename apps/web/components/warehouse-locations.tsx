"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";

interface WarehouseLocation {
  id: string;
  parentId: string | null;
  kind: "zone" | "aisle" | "rack" | "bin";
  code: string;
}

const KINDS = ["zone", "aisle", "rack", "bin"] as const;

/** Renders one node plus its descendants, indented by depth — a flat list from the API, walked
 * recursively here rather than asking the server for a nested shape (small per-warehouse N). */
function LocationNode({
  location,
  allLocations,
  depth,
  t,
  onDelete,
}: {
  location: WarehouseLocation;
  allLocations: WarehouseLocation[];
  depth: number;
  t: (key: string) => string;
  onDelete: (id: string) => void;
}) {
  const children = allLocations.filter((l) => l.parentId === location.id);
  return (
    <>
      <li style={{ paddingLeft: `${depth * 1.25}rem` }} className="flex items-center gap-2 py-1 text-sm">
        <span className="text-gray-400 dark:text-gray-500">{t(location.kind)}</span>
        <span className="font-medium">{location.code}</span>
        <button
          onClick={() => onDelete(location.id)}
          className="ml-auto text-xs text-gray-400 hover:text-error-600"
        >
          {t("deleteLocation")}
        </button>
      </li>
      {children.map((child) => (
        <LocationNode key={child.id} location={child} allLocations={allLocations} depth={depth + 1} t={t} onDelete={onDelete} />
      ))}
    </>
  );
}

export function WarehouseLocations({ warehouseId }: { warehouseId: string }) {
  const t = useTranslations("warehouses");
  const [locations, setLocations] = useState<WarehouseLocation[] | null>(null);
  const [form, setForm] = useState({ parentId: "", kind: "zone" as (typeof KINDS)[number], code: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<WarehouseLocation[]>(`/materials/warehouse-locations?warehouseId=${warehouseId}`).then(setLocations);
  }

  useEffect(load, [warehouseId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/materials/warehouse-locations", {
        method: "POST",
        body: JSON.stringify({ warehouseId, parentId: form.parentId || undefined, kind: form.kind, code: form.code }),
      });
      setForm((f) => ({ ...f, code: "" }));
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      await apiFetch(`/materials/warehouse-locations/${id}`, { method: "DELETE" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  const roots = (locations ?? []).filter((l) => l.parentId === null);

  return (
    <div className="mt-8">
      <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("locations")}</h2>

      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
          {t("parentLocation")}
          <select
            className="input w-auto"
            value={form.parentId}
            onChange={(e) => setForm((f) => ({ ...f, parentId: e.target.value }))}
          >
            <option value="">—</option>
            {(locations ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {t(l.kind)} {l.code}
              </option>
            ))}
          </select>
        </label>
        <select
          className="input w-auto"
          value={form.kind}
          onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as (typeof KINDS)[number] }))}
        >
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {t(k)}
            </option>
          ))}
        </select>
        <input
          required
          placeholder={t("locationCode")}
          className="input w-28"
          value={form.code}
          onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
        />
        <button type="submit" disabled={busy} className="btn-secondary">
          {t("addLocation")}
        </button>
      </form>
      {error && <p className="mt-2 text-xs text-error-600">{error}</p>}

      {locations && locations.length > 0 && (
        <ul className="mt-4">
          {roots.map((root) => (
            <LocationNode key={root.id} location={root} allLocations={locations} depth={0} t={t} onDelete={handleDelete} />
          ))}
        </ul>
      )}
    </div>
  );
}
