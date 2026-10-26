"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, notifyApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format-date";
import { resetStateInEffect } from "@/lib/effect-reset";
import { Badge } from "@/components/ui/badge";
import { useWarehouseDetail } from "./context";
import type { StockCount } from "./types";

/** Stock counts: start one, enter what was counted, finalize it to book the variances. */
export function StockCounts() {
  const t = useTranslations("warehouses");
  const tc = useTranslations("common");
  const ta = useTranslations("a11y");
  const { warehouseId, busy, setBusy, refresh } = useWarehouseDetail();
  const [counts, setCounts] = useState<StockCount[] | null>(null);
  const [activeCount, setActiveCount] = useState<StockCount | null>(null);
  const [lineInputs, setLineInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    if (activeCount) {
      resetStateInEffect(() =>
        setLineInputs(
          Object.fromEntries(
            activeCount.lines.map((l) => [l.id, l.countedQuantity]),
          ),
        ),
      );
    }
  }, [activeCount?.id]);

  function loadCounts() {
    apiFetch<StockCount[]>(
      `/materials/stock/counts?warehouseId=${warehouseId}`,
    ).then(setCounts).catch(notifyApiError);
  }

  useEffect(() => {
    loadCounts();
    resetStateInEffect(() => setActiveCount(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseId]);

  async function startCount() {
    setBusy(true);
    try {
      const count = await apiFetch<StockCount>("/materials/stock/counts", {
        method: "POST",
        body: JSON.stringify({ warehouseId }),
      });
      setActiveCount(count);
      loadCounts();
    } finally {
      setBusy(false);
    }
  }

  async function viewCount(id: string) {
    const count = await apiFetch<StockCount>(`/materials/stock/counts/${id}`);
    setActiveCount(count);
  }

  async function saveLine(lineId: string, countedQuantity: string) {
    if (!activeCount || countedQuantity === "") return;
    await apiFetch(
      `/materials/stock/counts/${activeCount.id}/lines/${lineId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ countedQuantity: Number(countedQuantity) }),
      },
    );
    setActiveCount((c) =>
      c
        ? {
            ...c,
            lines: c.lines.map((l) =>
              l.id === lineId ? { ...l, countedQuantity } : l,
            ),
          }
        : c,
    );
  }

  async function finalizeCount() {
    if (!activeCount) return;
    setBusy(true);
    try {
      await apiFetch(`/materials/stock/counts/${activeCount.id}/finalize`, {
        method: "POST",
      });
      setActiveCount(null);
      loadCounts();
      refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mb-3 mt-8 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-fg-muted">
          {t("stockCounts")}
        </h2>
        <button
          onClick={startCount}
          disabled={busy}
          className="btn-secondary px-3 py-1 text-xs"
        >
          {t("startCount")}
        </button>
      </div>

      {counts && counts.length > 0 && !activeCount && (
        <ul className="flex flex-col gap-2">
          {counts.map((c) => {
            const varianceCount = c.lines.filter(
              (l) => l.countedQuantity !== l.systemQuantity,
            ).length;
            return (
              <li key={c.id}>
                <button
                  onClick={() => viewCount(c.id)}
                  className="card flex w-full items-center justify-between text-left hover:border-gray-400"
                >
                  <span className="text-sm">
                    {formatDate(new Date(c.createdAt))}
                  </span>
                  <span className="flex items-center gap-2 text-xs">
                    {varianceCount > 0 && (
                      <span className="text-warning-fg">
                        {t("variances", { count: varianceCount })}
                      </span>
                    )}
                    <Badge tone={c.status === "finalized" ? "success" : "neutral"}>
                      {t(c.status)}
                    </Badge>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {activeCount && (
        <div>
          <button
            onClick={() => setActiveCount(null)}
            className="mb-2 text-xs text-fg-subtle hover:underline"
          >
            ← {tc("back")}
          </button>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-fg-subtle">
                  <th scope="col" className="py-2">{t("material")}</th>
                  <th scope="col">{t("systemQuantity")}</th>
                  <th scope="col">{t("countedQuantity")}</th>
                  <th scope="col">{t("variance")}</th>
                </tr>
              </thead>
              <tbody>
                {activeCount.lines.map((line) => {
                  const variance =
                    Number(lineInputs[line.id] ?? line.countedQuantity) -
                    Number(line.systemQuantity);
                  return (
                    <tr
                      key={line.id}
                      className="border-b border-gray-100 dark:border-gray-700"
                    >
                      <td className="py-1.5">
                        {line.materialCatalogItem.name} (
                        {line.materialCatalogItem.code})
                      </td>
                      <td className="text-fg-subtle">
                        {line.systemQuantity} {line.materialCatalogItem.unit}
                      </td>
                      <td>
                        {activeCount.status === "draft" ? (
                          <input aria-label={ta("fieldOf", { field: ta("countedQuantity"), item: line.materialCatalogItem.name })}
                            type="number"
                            step="0.01"
                            className="input w-24"
                            value={lineInputs[line.id] ?? line.countedQuantity}
                            onChange={(e) =>
                              setLineInputs((li) => ({
                                ...li,
                                [line.id]: e.target.value,
                              }))
                            }
                            onBlur={(e) => saveLine(line.id, e.target.value)}
                          />
                        ) : (
                          <span>
                            {line.countedQuantity}{" "}
                            {line.materialCatalogItem.unit}
                          </span>
                        )}
                      </td>
                      <td
                        className={
                          variance === 0
                            ? "text-fg-subtle"
                            : variance > 0
                              ? "text-success-fg"
                              : "text-danger-fg"
                        }
                      >
                        {variance > 0 ? "+" : ""}
                        {variance !== 0 ? variance : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {activeCount.status === "draft" && (
            <button
              onClick={finalizeCount}
              disabled={busy}
              className="btn-primary mt-3"
            >
              {t("finalizeCount")}
            </button>
          )}
        </div>
      )}
    </>
  );
}
