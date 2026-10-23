"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, notifyApiError } from "@/lib/api-client";
import type { EstimateSectionProps, IssueReportLine, Warehouse } from "./types";

/** An approved estimate's material requirements, and issuing them from a warehouse's stock. */
export function MaterialRequirements({ estimateId, estimate, busy, setBusy }: EstimateSectionProps) {
  const t = useTranslations("estimates");
  const ta = useTranslations("a11y");
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [issueWarehouseId, setIssueWarehouseId] = useState("");
  const [issueReport, setIssueReport] = useState<IssueReportLine[] | null>(null);

  useEffect(() => {
    apiFetch<Warehouse[]>("/materials/warehouses")
      .then((list) => {
        setWarehouses(list);
        if (list[0]) setIssueWarehouseId(list[0].id);
      })
      .catch(notifyApiError);
  }, [estimateId]);

  async function issueStock() {
    if (!issueWarehouseId) return;
    setBusy(true);
    try {
      const report = await apiFetch<{ lines: IssueReportLine[] }>("/materials/stock/issue-from-estimate", {
        method: "POST",
        body: JSON.stringify({ estimateId, warehouseId: issueWarehouseId }),
      });
      setIssueReport(report.lines);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8">
      <h2 className="mb-3 text-sm font-semibold text-fg-muted">{t("materialRequirements")}</h2>
      <div tabIndex={0} className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs text-fg-subtle dark:border-gray-700">
            <th scope="col" className="py-1.5 font-medium">{ta("material")}</th>
            <th scope="col" className="text-right font-medium">{ta("quantity")}</th>
          </tr>
        </thead>
        <tbody>
          {estimate.requirements.map((r) => (
            <tr key={r.id} className="border-b border-gray-100 dark:border-gray-700">
              <td className="py-2">{r.materialCatalogItem.name}</td>
              <td className="text-right">
                {r.quantity} {r.unit}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      {warehouses.length > 0 && (
        <div className="mt-4 flex items-end gap-2">
          <select aria-label={ta("warehouse")} className="input w-auto" value={issueWarehouseId} onChange={(e) => setIssueWarehouseId(e.target.value)}>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <button onClick={issueStock} disabled={busy} className="btn-secondary">
            {t("issueStock")}
          </button>
        </div>
      )}

      {issueReport && (
        <div className="mt-4">
          <h3 className="mb-2 text-xs font-semibold text-fg-subtle">{t("issueReport")}</h3>
          <div tabIndex={0} className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-fg-subtle">
                <th scope="col" className="py-1"></th>
                <th scope="col">{t("required")}</th>
                <th scope="col">{t("remainingStock")}</th>
              </tr>
            </thead>
            <tbody>
              {issueReport.map((r) => (
                <tr key={r.materialCatalogItemId} className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-1">{r.name}</td>
                  <td>{r.required}</td>
                  <td className={r.remainingStock < 0 ? "text-danger-fg" : ""}>{r.remainingStock}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
