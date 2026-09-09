"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";
import { EmptyState } from "@/components/ui/empty-state";

interface TaxJurisdiction {
  id: string;
  name: string;
}
interface LiabilityReport {
  invoices: { number: string; subtotal: string; taxAmount: string; createdAt: string }[];
  totalTaxableSales: number;
  totalTaxCollected: number;
}

function startOfYear() {
  return `${new Date().getFullYear()}-01-01`;
}
function today() {
  return new Date().toISOString().slice(0, 10);
}

export function TaxLiabilityPanel() {
  const t = useTranslations("tax");
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "";
  const isManager = me?.user.role === "owner" || me?.user.role === "admin";

  const [jurisdictions, setJurisdictions] = useState<TaxJurisdiction[]>([]);
  const [jurisdictionId, setJurisdictionId] = useState("");
  const [periodStart, setPeriodStart] = useState(startOfYear());
  const [periodEnd, setPeriodEnd] = useState(today());
  const [report, setReport] = useState<LiabilityReport | null>(null);

  useEffect(() => {
    apiFetch<TaxJurisdiction[]>("/tax/jurisdictions").then((list) => {
      setJurisdictions(list);
      if (list[0]) setJurisdictionId(list[0].id);
    });
  }, []);

  function load() {
    if (!jurisdictionId) return;
    // periodEnd is inclusive of the whole day the user picked; the API's range is exclusive at
    // the end, so push it to the start of the next day.
    const exclusiveEnd = new Date(periodEnd);
    exclusiveEnd.setDate(exclusiveEnd.getDate() + 1);
    apiFetch<LiabilityReport>(
      `/tax/liability-report?jurisdictionId=${jurisdictionId}&periodStart=${new Date(periodStart).toISOString()}&periodEnd=${exclusiveEnd.toISOString()}`,
    ).then(setReport);
  }
  useEffect(load, [jurisdictionId, periodStart, periodEnd]);

  return (
    <div className="mt-10">
      <h2 className="mb-1 text-sm font-semibold text-gray-700">{t("liabilityReportTitle")}</h2>
      <p className="mb-3 text-xs text-gray-500">{t("liabilityReportHint")}</p>

      {jurisdictions.length === 0 ? (
        <EmptyState
          message={t("noJurisdictionsConfigured")}
          cta={isManager ? { label: t("manageJurisdictions"), href: "/settings?tab=billing" } : undefined}
        />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-end gap-2">
            <select className="input w-auto" value={jurisdictionId} onChange={(e) => setJurisdictionId(e.target.value)}>
              {jurisdictions.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.name}
                </option>
              ))}
            </select>
            <input type="date" className="input w-auto" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            <input type="date" className="input w-auto" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </div>

          {report && (
            <div className="card grid grid-cols-2 gap-3 max-w-md">
              <div>
                <div className="text-xs text-gray-500">{t("totalTaxableSales")}</div>
                <div className="mt-1 text-lg font-semibold text-gray-900">
                  {report.totalTaxableSales} {currency}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500">{t("totalTaxCollected")}</div>
                <div className="mt-1 text-lg font-semibold text-gray-900">
                  {report.totalTaxCollected} {currency}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
