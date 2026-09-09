"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { discardQueued, retryQueued, type QueuedMutation } from "@/lib/offline-queue";

/** A queued offline mutation the server rejected once we came back online — a real conflict
 * (the record it targeted was edited/deleted elsewhere, or the data no longer validates), not a
 * connectivity problem. Shown so the field user can retry after fixing things, or give up on it
 * explicitly, rather than it silently blocking every mutation queued after it forever. */
export function OfflineConflictsBanner({ items, onChange }: { items: QueuedMutation[]; onChange: () => void }) {
  const t = useTranslations("field");
  const [busyId, setBusyId] = useState<number | null>(null);

  if (items.length === 0) return null;

  async function retry(id: number) {
    setBusyId(id);
    try {
      await retryQueued(id);
      onChange();
    } finally {
      setBusyId(null);
    }
  }

  async function discard(id: number) {
    setBusyId(id);
    try {
      await discardQueued(id);
      onChange();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="border-b border-error-200 bg-error-50 dark:bg-error-500/15 px-4 py-3">
      <p className="text-xs font-medium text-error-700 dark:text-error-500">{t("syncConflicts", { count: items.length })}</p>
      <ul className="mt-2 flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.id} className="rounded-lg border border-error-200 bg-white dark:bg-gray-800 px-3 py-2 text-xs">
            <div className="font-medium text-gray-700 dark:text-gray-200">{item.kind}</div>
            <div className="mt-0.5 text-error-600">{item.error}</div>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => retry(item.id)}
                disabled={busyId === item.id}
                className="rounded-md bg-gray-100 dark:bg-gray-700 px-2 py-1 font-medium text-gray-700 dark:text-gray-200"
              >
                {t("retrySync")}
              </button>
              <button
                onClick={() => discard(item.id)}
                disabled={busyId === item.id}
                className="rounded-md bg-error-100 px-2 py-1 font-medium text-error-700 dark:text-error-500"
              >
                {t("discardSync")}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
