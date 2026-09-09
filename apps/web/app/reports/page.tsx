"use client";

import { useTranslations } from "next-intl";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { CustomReportsPanel } from "@/components/custom-reports-panel";
import { SafetyScorecardPanel } from "@/components/safety-scorecard-panel";
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

export default function ReportsPage() {
  const t = useTranslations("reports");
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "";

  return (
    <AuthenticatedShell>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      <ProjectMarginsReportPanel currency={currency} />
      <EstimateAtCompletionReportPanel currency={currency} />
      <WipReportPanel currency={currency} />
      <WarehouseTurnoverReportPanel />
      <InvoiceAgingReportPanel currency={currency} />
      <CashFlowForecastPanel currency={currency} />
      <RevenueTrendPanel />
      <TeamWorkloadPanel currency={currency} />
      <ScheduledReportsPanel />

      <ComplianceCalendarPanel />
      <SafetyScorecardPanel />
      <GeofenceViolationsPanel />
      <EquipmentUtilizationPanel />
      <FixedAssetRegisterPanel />
      <MarketingRoiPanel />
      <WarrantyExpiringPanel />
      <TaxLiabilityPanel />
      <BenefitsCostSummaryPanel />
      <WinRatePanel />
      <ProductivityScorecardPanel />
      <DiversitySpendPanel />
      <CarbonSummaryPanel />
      <CustomReportsPanel />
    </AuthenticatedShell>
  );
}
