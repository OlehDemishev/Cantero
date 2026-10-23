"use client";

import { useTranslations } from "next-intl";
import { useApi } from "@/lib/use-api";
import { useCan } from "@/lib/permissions";
import { PanelErrorState } from "@/components/ui/error-state";
import { useMe } from "@/lib/use-me";
import { formatCurrency } from "@/lib/format-currency";

interface CostSummary {
  activeEnrollmentCount: number;
  totalMonthlyEmployerCost: number;
  totalMonthlyEmployeeCost: number;
}

export function BenefitsCostSummaryPanel() {
  const t = useTranslations("benefits");
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "";
  const canSee = useCan()("hr.payroll");
  const { data: summary = null, error, reload } = useApi<CostSummary>(canSee ? "/benefits/cost-summary" : null);

  if (!canSee) return null;
  if (error && !summary) return <PanelErrorState title={t("costSummaryTitle")} error={error} onRetry={reload} />;
  if (!summary || summary.activeEnrollmentCount === 0) return null;

  return (
    <div className="mt-10">
      <h2 className="mb-1 text-sm font-semibold text-fg-muted">{t("costSummaryTitle")}</h2>
      <p className="mb-3 text-xs text-fg-subtle">{t("costSummaryHint")}</p>
      <div className="card grid grid-cols-3 gap-3 max-w-lg">
        <div>
          <div className="text-xs text-fg-subtle">{t("activeEnrollments")}</div>
          <div className="mt-1 text-lg font-semibold text-fg">{summary.activeEnrollmentCount}</div>
        </div>
        <div>
          <div className="text-xs text-fg-subtle">{t("totalEmployerCost")}</div>
          <div className="mt-1 text-lg font-semibold text-fg">
            {formatCurrency(summary.totalMonthlyEmployerCost, currency)}
          </div>
        </div>
        <div>
          <div className="text-xs text-fg-subtle">{t("totalEmployeeCost")}</div>
          <div className="mt-1 text-lg font-semibold text-fg">
            {formatCurrency(summary.totalMonthlyEmployeeCost, currency)}
          </div>
        </div>
      </div>
    </div>
  );
}
