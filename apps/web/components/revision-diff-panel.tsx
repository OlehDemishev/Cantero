"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";

interface RevisionSummary {
  id: string;
  versionNumber: number;
  grandTotal: string;
}
interface DiffLine {
  rateCatalogItemCode: string;
  rateCatalogItemName: string;
  unit: string;
  quantity: number;
  lineTotal: number;
  previousQuantity?: number;
  previousLineTotal?: number;
}
interface RevisionDiff {
  from: { versionNumber: number; grandTotal: string };
  to: { versionNumber: number; grandTotal: string };
  grandTotalDelta: number;
  added: DiffLine[];
  removed: DiffLine[];
  changed: DiffLine[];
}

export function RevisionDiffPanel({ estimateId, revisions, currency }: { estimateId: string; revisions: RevisionSummary[]; currency: string }) {
  const t = useTranslations("estimates");
  const tc = useTranslations("common");

  const [fromId, setFromId] = useState(revisions[0]?.id ?? "");
  const [toId, setToId] = useState(revisions[revisions.length - 1]?.id ?? "");
  const [diff, setDiff] = useState<RevisionDiff | null>(null);
  const [busy, setBusy] = useState(false);

  async function compare() {
    if (!fromId || !toId || fromId === toId) return;
    setBusy(true);
    try {
      const result = await apiFetch<RevisionDiff>(`/estimates/${estimateId}/revisions/diff?from=${fromId}&to=${toId}`);
      setDiff(result);
    } finally {
      setBusy(false);
    }
  }

  if (revisions.length < 2) return null;

  return (
    <div className="mt-6 border-t border-gray-100 dark:border-gray-700 pt-4">
      <h3 className="mb-2 text-xs font-semibold text-gray-500 dark:text-gray-400">{t("compareRevisions")}</h3>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
          {t("from")}
          <select className="input mt-1" value={fromId} onChange={(e) => setFromId(e.target.value)}>
            {revisions.map((r) => (
              <option key={r.id} value={r.id}>
                {t("version")} {r.versionNumber}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
          {t("to")}
          <select className="input mt-1" value={toId} onChange={(e) => setToId(e.target.value)}>
            {revisions.map((r) => (
              <option key={r.id} value={r.id}>
                {t("version")} {r.versionNumber}
              </option>
            ))}
          </select>
        </label>
        <button onClick={compare} disabled={busy || fromId === toId} className="btn-secondary px-3 py-1 text-xs">
          {t("compare")}
        </button>
      </div>

      {diff && (
        <div className="mt-3">
          <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
            {t("grandTotalDelta")}: {diff.grandTotalDelta >= 0 ? "+" : ""}
            {diff.grandTotalDelta.toFixed(2)} {currency}
          </p>
          {diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">{t("noDifferences")}</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {diff.added.map((l) => (
                <li key={`add-${l.rateCatalogItemCode}`} className="text-success-700 dark:text-success-500">
                  + {l.rateCatalogItemName} ({l.quantity} {l.unit})
                </li>
              ))}
              {diff.removed.map((l) => (
                <li key={`rem-${l.rateCatalogItemCode}`} className="text-error-700 dark:text-error-500">
                  − {l.rateCatalogItemName} ({l.quantity} {l.unit})
                </li>
              ))}
              {diff.changed.map((l) => (
                <li key={`chg-${l.rateCatalogItemCode}`} className="text-amber-700">
                  {l.rateCatalogItemName}: {l.previousQuantity} → {l.quantity} {l.unit}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
