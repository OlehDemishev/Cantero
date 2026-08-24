"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";

interface SavedViewRecord<T> {
  id: string;
  name: string;
  filters: T;
}

export function SavedViewsBar<T extends object>({
  viewType,
  currentFilters,
  onApply,
}: {
  viewType: string;
  currentFilters: T;
  onApply: (filters: T) => void;
}) {
  const t = useTranslations("savedViews");

  const [views, setViews] = useState<SavedViewRecord<T>[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<SavedViewRecord<T>[]>(`/saved-views?viewType=${viewType}`).then(setViews);
  }

  useEffect(load, [viewType]);

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await apiFetch("/saved-views", {
        method: "POST",
        body: JSON.stringify({ viewType, name: name.trim(), filters: currentFilters }),
      });
      setName("");
      load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await apiFetch(`/saved-views/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {views && views.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {views.map((v) => (
            <span key={v.id} className="flex items-center gap-1 rounded-full border border-gray-200 px-2 py-1 text-xs">
              <button type="button" onClick={() => onApply(v.filters)} className="text-brand-700 hover:underline">
                {v.name}
              </button>
              <button
                type="button"
                onClick={() => remove(v.id)}
                aria-label={t("removeView")}
                className="text-gray-400 hover:text-error-600"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <input
          className="input w-32 py-1 text-xs"
          placeholder={t("nameThisView")}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="button" onClick={save} disabled={busy || !name.trim()} className="btn-secondary px-2 py-1 text-xs">
          {t("saveView")}
        </button>
      </div>
    </div>
  );
}
