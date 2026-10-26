"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { CostCode } from "@/components/cost-codes-panel";
import { apiFetch, notifyApiError } from "@/lib/api-client";
import { resetStateInEffect } from "@/lib/effect-reset";
import { useCan } from "@/lib/permissions";
import { formatCurrency } from "@/lib/format-currency";
import { Badge } from "@/components/ui/badge";
import { BENCHMARK_FLAG_THRESHOLD, type EstimateSectionProps, type LineBenchmark, type RateCatalogItem } from "./types";

/** The estimate's lines, with a cost-benchmark flag on outliers, and (in a draft) a form for a new line. */
export function LinesSection({
  estimateId,
  estimate,
  currency,
  busy,
  setBusy,
  reload,
  rateItems,
}: EstimateSectionProps & { rateItems: RateCatalogItem[] }) {
  const t = useTranslations("estimates");
  const ta = useTranslations("a11y");
  const [newLine, setNewLine] = useState({ rateCatalogItemId: "", quantity: "1", costCodeId: "" });
  const [formulaValues, setFormulaValues] = useState<Record<string, string>>({});
  const [formulaResult, setFormulaResult] = useState<{ value: number | null; error: string | null }>({ value: null, error: null });
  const [costCodes, setCostCodes] = useState<CostCode[]>([]);
  const [benchmarks, setBenchmarks] = useState<Record<string, LineBenchmark>>({});
  const can = useCan();

  /** Cost benchmarks are a costing figure — only for members who may see costs (costing.view). */
  const seesCosts = can("costing.view");
  function loadBenchmarks() {
    if (!seesCosts) return;
    apiFetch<LineBenchmark[]>(`/estimate-accuracy/cost-benchmarks/${estimateId}`)
      .then((list) => setBenchmarks(Object.fromEntries(list.map((b) => [b.estimateLineId, b]))))
      .catch(() => setBenchmarks({}));
  }

  useEffect(() => {
    loadBenchmarks();
    apiFetch<CostCode[]>("/cost-codes").then(setCostCodes).catch(notifyApiError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estimateId]);

  useEffect(() => {
    if (rateItems[0]) resetStateInEffect(() => setNewLine((l) => ({ ...l, rateCatalogItemId: rateItems[0].id })));
  }, [rateItems]);

  const rateItemsById = Object.fromEntries(rateItems.map((r) => [r.id, r]));
  const selectedRateItem = rateItemsById[newLine.rateCatalogItemId];

  async function computeFormula() {
    if (!selectedRateItem?.formula) return;
    setFormulaResult({ value: null, error: null });
    try {
      const variables = Object.fromEntries(selectedRateItem.formulaParams.map((p) => [p, Number(formulaValues[p] ?? 0)]));
      const result = await apiFetch<{ value: number }>(`/estimates/rate-catalog/${selectedRateItem.id}/evaluate-formula`, {
        method: "POST",
        body: JSON.stringify({ variables }),
      });
      setFormulaResult({ value: result.value, error: null });
    } catch (err) {
      setFormulaResult({ value: null, error: err instanceof Error ? err.message : String(err) });
    }
  }

  async function addLine(e: React.FormEvent) {
    e.preventDefault();
    const quantity = selectedRateItem?.formula ? formulaResult.value : Number(newLine.quantity);
    if (quantity === null || quantity === undefined || Number.isNaN(quantity)) return;
    setBusy(true);
    try {
      await apiFetch(`/estimates/${estimateId}/lines`, {
        method: "POST",
        body: JSON.stringify({
          rateCatalogItemId: newLine.rateCatalogItemId,
          quantity,
          costCodeId: newLine.costCodeId || undefined,
        }),
      });
      setFormulaValues({});
      setFormulaResult({ value: null, error: null });
      reload();
      loadBenchmarks();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div tabIndex={0} className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-fg-subtle">
            <th scope="col" className="py-2">{t("rateItem")}</th>
            <th scope="col">{t("quantity")}</th>
            <th scope="col">{t("materialsCost")}</th>
            <th scope="col">{t("laborCost")}</th>
            <th scope="col">{t("lineTotal")}</th>
          </tr>
        </thead>
        <tbody>
          {estimate.lines.map((line) => (
            <tr key={line.id} className="border-b border-gray-100 dark:border-gray-700">
              <td className="py-2">{rateItemsById[line.rateCatalogItemId]?.name ?? line.rateCatalogItemId}</td>
              <td>
                {line.quantity} {rateItemsById[line.rateCatalogItemId]?.unit}
              </td>
              <td>
                {formatCurrency(line.materialsCost, currency)}
              </td>
              <td>
                {formatCurrency(line.laborCost, currency)}
              </td>
              <td className="font-medium">
                <div className="flex items-center gap-2">
                  <span>
                    {formatCurrency(line.lineTotal, currency)}
                  </span>
                  {benchmarks[line.id] && Math.abs(benchmarks[line.id].deviationPercent) >= BENCHMARK_FLAG_THRESHOLD && (
                    <Badge
                      tone={benchmarks[line.id].deviationPercent > 0 ? "warning" : "success"}
                      className="shrink-0"
                      title={t("benchmarkHint", {
                        median: formatCurrency(benchmarks[line.id].benchmarkMedian, currency),
                        count: benchmarks[line.id].benchmarkSampleSize,
                      })}
                    >
                      {benchmarks[line.id].deviationPercent > 0 ? "+" : ""}
                      {benchmarks[line.id].deviationPercent}%
                    </Badge>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      {estimate.status === "draft" && (
        <form onSubmit={addLine} className="mt-4 flex flex-col gap-2">
          <div className="flex flex-wrap items-end gap-2">
            <select aria-label={t("rateItem")}
              className="input"
              value={newLine.rateCatalogItemId}
              onChange={(e) => {
                setNewLine((l) => ({ ...l, rateCatalogItemId: e.target.value }));
                setFormulaValues({});
                setFormulaResult({ value: null, error: null });
              }}
            >
              {rateItems.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.unit})
                  {r.formula ? " ƒ" : ""}
                </option>
              ))}
            </select>
            {!selectedRateItem?.formula && (
              <input aria-label={t("quantity")}
                type="number"
                step="0.01"
                min="0.01"
                className="input w-28"
                value={newLine.quantity}
                onChange={(e) => setNewLine((l) => ({ ...l, quantity: e.target.value }))}
              />
            )}
            {costCodes.length > 0 && (
              <select aria-label={ta("costCode")}
                className="input w-auto"
                value={newLine.costCodeId}
                onChange={(e) => setNewLine((l) => ({ ...l, costCodeId: e.target.value }))}
              >
                <option value="">{t("costCodeUnassigned")}</option>
                {costCodes.map((cc) => (
                  <option key={cc.id} value={cc.id}>
                    {cc.code} {cc.name}
                  </option>
                ))}
              </select>
            )}
            <button type="submit" disabled={busy || (!!selectedRateItem?.formula && formulaResult.value === null)} className="btn-secondary">
              {t("addLine")}
            </button>
          </div>

          {selectedRateItem?.formula && (
            <div className="flex flex-wrap items-end gap-2 rounded-lg border border-gray-100 dark:border-gray-700 p-3">
              <span className="font-mono text-xs text-fg-subtle">{selectedRateItem.formula}</span>
              {selectedRateItem.formulaParams.map((param) => (
                <label key={param} className="flex flex-col gap-1 text-xs text-fg-subtle">
                  {param}
                  <input
                    type="number"
                    step="any"
                    className="input w-24"
                    value={formulaValues[param] ?? ""}
                    onChange={(e) => setFormulaValues((v) => ({ ...v, [param]: e.target.value }))}
                  />
                </label>
              ))}
              <button type="button" onClick={computeFormula} className="btn-secondary px-3 py-1 text-xs">
                {t("computeFormula")}
              </button>
              {formulaResult.value !== null && (
                <span className="text-xs font-medium text-success-fg">
                  {t("computedQuantity", { value: formulaResult.value, unit: selectedRateItem.unit })}
                </span>
              )}
              {formulaResult.error && <span className="text-xs text-danger-fg">{formulaResult.error}</span>}
            </div>
          )}
        </form>
      )}
    </>
  );
}
