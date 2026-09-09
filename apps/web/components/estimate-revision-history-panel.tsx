"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { formatDate } from "@/lib/format-date";
import { RevisionDiffPanel } from "@/components/revision-diff-panel";

interface RateCatalogItem {
  code: string;
  name: string;
  unit: string;
}
interface EstimateLine {
  id: string;
  rateCatalogItemId: string;
  quantity: string;
  lineTotal: string;
}
interface RevisionSummary {
  id: string;
  versionNumber: number;
  grandTotal: string;
  createdAt: string;
}
interface RevisionLineSnapshot {
  rateCatalogItemCode: string;
  rateCatalogItemName: string;
  unit: string;
  quantity: number;
  materialsCost: number;
  laborCost: number;
  lineTotal: number;
}
interface Revision extends RevisionSummary {
  lines: RevisionLineSnapshot[];
}
interface ComparisonRow {
  code: string;
  name: string;
  unit: string;
  revQuantity: number | null;
  curQuantity: number | null;
  revTotal: number | null;
  curTotal: number | null;
  kind: "added" | "removed" | "changed" | "same";
}

function buildComparison(
  revision: Revision,
  currentLines: EstimateLine[],
  rateItemsById: Record<string, RateCatalogItem>,
): ComparisonRow[] {
  const currentByCode = new Map<string, { name: string; unit: string; quantity: number; lineTotal: number }>();
  for (const line of currentLines) {
    const info = rateItemsById[line.rateCatalogItemId];
    if (!info) continue;
    currentByCode.set(info.code, {
      name: info.name,
      unit: info.unit,
      quantity: Number(line.quantity),
      lineTotal: Number(line.lineTotal),
    });
  }
  const revByCode = new Map(revision.lines.map((l) => [l.rateCatalogItemCode, l]));
  const allCodes = new Set([...currentByCode.keys(), ...revByCode.keys()]);

  return Array.from(allCodes).map((code) => {
    const cur = currentByCode.get(code);
    const rev = revByCode.get(code);
    let kind: ComparisonRow["kind"] = "same";
    if (!rev) kind = "added";
    else if (!cur) kind = "removed";
    else if (rev.quantity !== cur.quantity || rev.lineTotal !== cur.lineTotal) kind = "changed";
    return {
      code,
      name: cur?.name ?? rev?.rateCatalogItemName ?? code,
      unit: cur?.unit ?? rev?.unit ?? "",
      revQuantity: rev?.quantity ?? null,
      curQuantity: cur?.quantity ?? null,
      revTotal: rev?.lineTotal ?? null,
      curTotal: cur?.lineTotal ?? null,
      kind,
    };
  });
}

export function EstimateRevisionHistoryPanel({
  estimateId,
  currentLines,
  rateItemsById,
  currency,
  refreshSignal,
}: {
  estimateId: string;
  currentLines: EstimateLine[];
  rateItemsById: Record<string, RateCatalogItem>;
  currency: string;
  /** Approving the estimate mints a new revision; bump this from the parent to refetch. */
  refreshSignal?: number;
}) {
  const t = useTranslations("estimates");
  const tc = useTranslations("common");

  const [revisions, setRevisions] = useState<RevisionSummary[] | null>(null);
  const [selectedRevision, setSelectedRevision] = useState<Revision | null>(null);
  const [loadingRevision, setLoadingRevision] = useState(false);

  useEffect(() => {
    apiFetch<RevisionSummary[]>(`/estimates/${estimateId}/revisions`).then(setRevisions);
  }, [estimateId, refreshSignal]);

  async function viewRevision(revisionId: string) {
    setLoadingRevision(true);
    setSelectedRevision(null);
    try {
      const revision = await apiFetch<Revision>(`/estimates/${estimateId}/revisions/${revisionId}`);
      setSelectedRevision(revision);
    } finally {
      setLoadingRevision(false);
    }
  }

  if (!revisions || revisions.length === 0) return null;

  const comparison = selectedRevision ? buildComparison(selectedRevision, currentLines, rateItemsById) : null;

  return (
    <div className="mt-10">
      <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("revisionHistory")}</h2>
      <ul className="flex flex-col gap-2">
        {revisions.map((rev) => (
          <li key={rev.id}>
            <button
              onClick={() => viewRevision(rev.id)}
              className={`card flex w-full items-center justify-between text-left hover:border-gray-400 ${
                selectedRevision?.id === rev.id ? "border-brand-300" : ""
              }`}
            >
              <span className="text-sm font-medium">
                {t("version")} {rev.versionNumber}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {formatDate(new Date(rev.createdAt))} · {rev.grandTotal} {currency}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {loadingRevision && <p className="mt-3 text-sm text-gray-400 dark:text-gray-500">{tc("loading")}</p>}

      {comparison && selectedRevision && (
        <div className="mt-4">
          <h3 className="mb-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
            {t("compareToCurrent", { version: selectedRevision.versionNumber })}
          </h3>
          <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                <th className="py-1">{t("rateItem")}</th>
                <th>{t("version")} {selectedRevision.versionNumber}</th>
                <th>{tc("status")}</th>
                <th>{t("current")}</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map((row) => (
                <tr key={row.code} className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-1">{row.name}</td>
                  <td className={row.kind === "removed" ? "text-error-600" : ""}>
                    {row.revQuantity !== null ? `${row.revQuantity} ${row.unit} · ${row.revTotal} ${currency}` : "—"}
                  </td>
                  <td>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        row.kind === "added"
                          ? "bg-success-50 dark:bg-success-500/15 text-success-700 dark:text-success-500"
                          : row.kind === "removed"
                            ? "bg-error-50 dark:bg-error-500/15 text-error-700 dark:text-error-500"
                            : row.kind === "changed"
                              ? "bg-warning-50 dark:bg-warning-500/15 text-warning-700 dark:text-warning-500"
                              : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                      }`}
                    >
                      {t(row.kind)}
                    </span>
                  </td>
                  <td className={row.kind === "added" ? "text-success-700 dark:text-success-500" : ""}>
                    {row.curQuantity !== null ? `${row.curQuantity} ${row.unit} · ${row.curTotal} ${currency}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      <RevisionDiffPanel estimateId={estimateId} revisions={revisions} currency={currency} />
    </div>
  );
}
