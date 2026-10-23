"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useApi } from "@/lib/use-api";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/lib/use-me";
import { EmptyState } from "@/components/ui/empty-state";
import { useCan } from "@/lib/permissions";
import { formatCurrency } from "@/lib/format-currency";

interface TaxJurisdiction {
  id: string;
  name: string;
}
interface LiabilityReport {
  invoices: { number: string; subtotal: string; taxAmount: string; createdAt: string }[];
  totalTaxableSales: number;
  totalTaxCollected: number;
}

const NO_JURISDICTIONS: TaxJurisdiction[] = [];

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
  const isManager = useCan()("finance.manage");

  const canSee = useCan()("finance.view");
  const {
    data: jurisdictions = NO_JURISDICTIONS,
    error: jurisdictionsError,
    loading: jurisdictionsLoading,
    reload: reloadJurisdictions,
  } = useApi<TaxJurisdiction[]>(canSee ? "/tax/jurisdictions" : null);
  const [pickedJurisdictionId, setJurisdictionId] = useState("");
  const jurisdictionId = pickedJurisdictionId || jurisdictions[0]?.id || "";
  const [periodStart, setPeriodStart] = useState(startOfYear());
  const [periodEnd, setPeriodEnd] = useState(today());
  // periodEnd is inclusive of the whole day the user picked; the API's range is exclusive at the
  // end, so push it to the start of the next day.
  const exclusiveEnd = new Date(periodEnd);
  exclusiveEnd.setDate(exclusiveEnd.getDate() + 1);
  const { data: report, error: reportError, reload: reloadReport } = useApi<LiabilityReport>(
    jurisdictionId
      ? `/tax/liability-report?jurisdictionId=${jurisdictionId}&periodStart=${new Date(periodStart).toISOString()}&periodEnd=${exclusiveEnd.toISOString()}`
      : null,
  );

  if (!canSee) return null;

  return (
    <div className="mt-10">
      <h2 className="mb-1 text-sm font-semibold text-fg-muted">{t("liabilityReportTitle")}</h2>
      <p className="mb-3 text-xs text-fg-subtle">{t("liabilityReportHint")}</p>

      {jurisdictionsError && jurisdictions.length === 0 ? (
        <ErrorState error={jurisdictionsError} onRetry={reloadJurisdictions} compact />
      ) : jurisdictionsLoading ? (
        <Skeleton lines={2} />
      ) : jurisdictions.length === 0 ? (
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

          {reportError && !report && <ErrorState error={reportError} onRetry={reloadReport} compact />}
          {report && (
            <div className="card grid grid-cols-2 gap-3 max-w-md">
              <div>
                <div className="text-xs text-fg-subtle">{t("totalTaxableSales")}</div>
                <div className="mt-1 text-lg font-semibold text-fg">
                  {formatCurrency(report.totalTaxableSales, currency)}
                </div>
              </div>
              <div>
                <div className="text-xs text-fg-subtle">{t("totalTaxCollected")}</div>
                <div className="mt-1 text-lg font-semibold text-fg">
                  {formatCurrency(report.totalTaxCollected, currency)}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
