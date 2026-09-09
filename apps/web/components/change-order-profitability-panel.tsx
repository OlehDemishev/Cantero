"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";

interface ProfitabilityRow {
  cost: number;
  revenue: number;
  margin: number;
  marginPercent: number | null;
}
interface ChangeOrderProfitabilityRow extends ProfitabilityRow {
  id: string;
  number: number;
  title: string;
}
interface Report {
  baseContract: ProfitabilityRow;
  changeOrders: ChangeOrderProfitabilityRow[];
  changeOrdersTotal: ProfitabilityRow;
  combined: ProfitabilityRow;
}

const pct = (n: number | null) => (n !== null ? `${n}%` : "—");

export function ChangeOrderProfitabilityPanel({ estimateId, currency }: { estimateId: string; currency: string }) {
  const t = useTranslations("estimates");
  const tc = useTranslations("common");

  const [report, setReport] = useState<Report | null>(null);

  useEffect(() => {
    apiFetch<Report>(`/estimates/${estimateId}/change-orders/profitability`).then(setReport);
  }, [estimateId]);

  if (!report || report.changeOrders.length === 0) return null;

  const marginClass = (marginPercent: number | null, baselinePercent: number | null) => {
    if (marginPercent === null) return "text-gray-400 dark:text-gray-500";
    if (baselinePercent === null) return "";
    return marginPercent < baselinePercent ? "text-error-600" : "text-success-700 dark:text-success-500";
  };

  return (
    <div className="mt-6 border-t border-gray-100 dark:border-gray-700 pt-4">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t("changeOrderProfitability")}</h3>
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{t("changeOrderProfitabilityHint")}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-xs">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
              <th className="py-1">{tc("name")}</th>
              <th className="text-right">{t("cost")}</th>
              <th className="text-right">{t("revenue")}</th>
              <th className="text-right">{t("margin")}</th>
              <th className="text-right">{t("marginPercent")}</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-100 dark:border-gray-700 font-medium">
              <td className="py-1">{t("baseContract")}</td>
              <td className="text-right">
                {report.baseContract.cost} {currency}
              </td>
              <td className="text-right">
                {report.baseContract.revenue} {currency}
              </td>
              <td className="text-right">
                {report.baseContract.margin} {currency}
              </td>
              <td className="text-right">{pct(report.baseContract.marginPercent)}</td>
            </tr>
            {report.changeOrders.map((co) => (
              <tr key={co.id} className="border-b border-gray-100 dark:border-gray-700">
                <td className="py-1">
                  CO-{co.number} — {co.title}
                </td>
                <td className="text-right">
                  {co.cost} {currency}
                </td>
                <td className="text-right">
                  {co.revenue} {currency}
                </td>
                <td className="text-right">
                  {co.margin} {currency}
                </td>
                <td className={`text-right font-medium ${marginClass(co.marginPercent, report.baseContract.marginPercent)}`}>
                  {pct(co.marginPercent)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td className="pt-1.5">{t("changeOrdersTotal")}</td>
              <td className="pt-1.5 text-right">
                {report.changeOrdersTotal.cost} {currency}
              </td>
              <td className="pt-1.5 text-right">
                {report.changeOrdersTotal.revenue} {currency}
              </td>
              <td className="pt-1.5 text-right">
                {report.changeOrdersTotal.margin} {currency}
              </td>
              <td className={`pt-1.5 text-right ${marginClass(report.changeOrdersTotal.marginPercent, report.baseContract.marginPercent)}`}>
                {pct(report.changeOrdersTotal.marginPercent)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
