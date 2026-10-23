"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";

interface Suggestion {
  item: { id: string; name: string; unit: string };
  count: number;
}

export function EstimateSuggestionsPanel({ estimateId, onAdded }: { estimateId: string; onAdded: () => void }) {
  const t = useTranslations("estimates");
  const { data: suggestions = [], setData: setSuggestions } = useApi<Suggestion[]>(`/estimates/${estimateId}/suggested-lines`);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function add(itemId: string) {
    setBusyId(itemId);
    try {
      await apiFetch(`/estimates/${estimateId}/lines`, {
        method: "POST",
        body: JSON.stringify({ rateCatalogItemId: itemId, quantity: 1 }),
      });
      setSuggestions((prev) => prev?.filter((s) => s.item.id !== itemId));
      onAdded();
    } finally {
      setBusyId(null);
    }
  }

  if (suggestions.length === 0) return null;

  return (
    <div className="mt-3">
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t("suggestedLines")}</p>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <button
            key={s.item.id}
            onClick={() => add(s.item.id)}
            disabled={busyId === s.item.id}
            className="rounded-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 px-3 py-1 text-xs text-fg-muted hover:border-brand-300 hover:bg-brand-50"
          >
            + {s.item.name}
          </button>
        ))}
      </div>
    </div>
  );
}
