"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { GeofenceViolationsPanel } from "@/components/geofence-violations-panel";
import { EquipmentUtilizationPanel } from "@/components/equipment-utilization-panel";
import { CarbonSummaryPanel } from "@/components/carbon-summary-panel";
import { ComplianceCalendarPanel } from "@/components/compliance-calendar-panel";
import { FixedAssetRegisterPanel } from "@/components/fixed-asset-register-panel";
import { MarketingRoiPanel } from "@/components/marketing-roi-panel";
import { WarrantyExpiringPanel } from "@/components/warranty-expiring-panel";
import { TaxLiabilityPanel } from "@/components/tax-liability-panel";
import { BenefitsCostSummaryPanel } from "@/components/benefits-cost-summary-panel";
import { WinRatePanel } from "@/components/win-rate-panel";
import { ProductivityScorecardPanel } from "@/components/productivity-scorecard-panel";
import { DiversitySpendPanel } from "@/components/diversity-spend-panel";
import { ProjectMarginsReportPanel } from "@/components/project-margins-report-panel";
import { EstimateAtCompletionReportPanel } from "@/components/estimate-at-completion-report-panel";
import { WipReportPanel } from "@/components/wip-report-panel";
import { WarehouseTurnoverReportPanel } from "@/components/warehouse-turnover-report-panel";
import { InvoiceAgingReportPanel } from "@/components/invoice-aging-report-panel";
import { CashFlowForecastPanel } from "@/components/cash-flow-forecast-panel";
import { RevenueTrendPanel } from "@/components/revenue-trend-panel";
import { TeamWorkloadPanel } from "@/components/team-workload-panel";
import { ScheduledReportsPanel } from "@/components/scheduled-reports-panel";
import { useMe } from "@/lib/use-me";
import { useReportAccess } from "@/lib/report-access";
import { PageHeader } from "@/components/ui/page-header";

// The two chart panels carry recharts: their own chunks, fetched after the page. Each shows its own
// skeleton once mounted (or nothing, for someone who may not see it), so nothing stands in before that.
const SafetyScorecardPanel = dynamic(() => import("@/components/safety-scorecard-panel").then((m) => m.SafetyScorecardPanel), {
  loading: () => null,
});
const CustomReportsPanel = dynamic(() => import("@/components/custom-reports-panel").then((m) => m.CustomReportsPanel), { loading: () => null });

export default function ReportsPage() {
  const t = useTranslations("reports");
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "";
  const canView = useReportAccess();

  return (
    <>
      <PageHeader title={t("title")} />

      {canView("project-margins") && <ProjectMarginsReportPanel currency={currency} />}
      {canView("estimate-at-completion") && <EstimateAtCompletionReportPanel currency={currency} />}
      {canView("wip-report") && <WipReportPanel currency={currency} />}
      {canView("warehouse-turnover") && <WarehouseTurnoverReportPanel />}
      {canView("invoice-aging") && <InvoiceAgingReportPanel currency={currency} />}
      {canView("cash-flow-forecast") && <CashFlowForecastPanel currency={currency} />}
      {canView("revenue-trend") && <RevenueTrendPanel />}
      <TeamWorkloadPanel currency={currency} />
      <ScheduledReportsPanel />

      {canView("compliance-calendar") && <ComplianceCalendarPanel />}
      <SafetyScorecardPanel />
      {canView("geofence-violations") && <GeofenceViolationsPanel />}
      {canView("equipment-utilization") && <EquipmentUtilizationPanel />}
      <FixedAssetRegisterPanel />
      <MarketingRoiPanel />
      <WarrantyExpiringPanel />
      <TaxLiabilityPanel />
      <BenefitsCostSummaryPanel />
      {canView("win-rate") && <WinRatePanel />}
      <ProductivityScorecardPanel />
      <DiversitySpendPanel />
      <CarbonSummaryPanel />
      <CustomReportsPanel />
    </>
  );
}
