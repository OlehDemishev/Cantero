"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";
import { formatCurrency } from "@/lib/format-currency";

interface CategorySpend {
  category: string;
  spend: number;
}
interface DiversitySpendReport {
  totalSpend: number;
  certifiedSpend: number;
  certifiedSharePercent: number | null;
  byCategory: CategorySpend[];
}

export function DiversitySpendPanel() {
  const t = useTranslations("diversitySpend");
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "USD";
  const money = (amount: number) => formatCurrency(amount, currency, me?.company.locale);

  const [report, setReport] = useState<DiversitySpendReport | null>(null);

  useEffect(() => {
    apiFetch<DiversitySpendReport>("/finance/subcontractors/diversity-spend-report").then(setReport);
  }, []);

  if (!report || report.totalSpend === 0) return null;

  return (
    <div className="mt-10">
      <h2 className="mb-1 text-sm font-semibold text-gray-700">{t("title")}</h2>
      <p className="mb-3 text-xs text-gray-500">{t("hint")}</p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="card">
          <div className="text-xs text-gray-500">{t("totalSpend")}</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-gray-900">{money(report.totalSpend)}</div>
        </div>
        <div className="card">
          <div className="text-xs text-gray-500">{t("certifiedSpend")}</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-gray-900">{money(report.certifiedSpend)}</div>
        </div>
        <div className="card">
          <div className="text-xs text-gray-500">{t("certifiedShare")}</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-gray-900">{report.certifiedSharePercent}%</div>
        </div>
      </div>

      {report.byCategory.length > 0 && (
        <div className="card mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-1.5">{t("category")}</th>
                <th className="text-right">{t("spend")}</th>
              </tr>
            </thead>
            <tbody>
              {report.byCategory.map((row) => (
                <tr key={row.category} className="border-b border-gray-100">
                  <td className="py-1.5 font-medium text-gray-900">{t(`category_${row.category}`)}</td>
                  <td className="text-right tabular-nums">{money(row.spend)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
