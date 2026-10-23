"use client";

import { useCan } from "@/lib/permissions";
import { IntacctProjectPanel } from "@/components/intacct-project-panel";
import { BudgetPanel } from "@/components/budget-panel";
import { AllowancesPanel } from "@/components/allowances-panel";
import { UnitPriceTmPanel } from "@/components/unit-price-tm-panel";
import { JobCostingPanel } from "@/components/job-costing-panel";
import { DrawRequestsPanel } from "@/components/draw-requests-panel";
import { ProjectCashFlowPanel } from "@/components/project-cash-flow-panel";
import { ContractsPanel } from "@/components/contracts-panel";
import { CostImpactSummaryPanel } from "@/components/cost-impact-summary-panel";

/** The project's "Financials" tab; loaded on demand by ProjectDetail (it carries recharts). */
export function FinancialsTab({ projectId }: { projectId: string }) {
  const can = useCan();
  return (
    <>
      {can("finance.view") && <IntacctProjectPanel projectId={projectId} />}
      {can("costing.view") && <BudgetPanel projectId={projectId} />}
      {can("costing.view") && <AllowancesPanel projectId={projectId} />}
      {can("estimates.view") && <UnitPriceTmPanel projectId={projectId} />}
      {can("costing.view") && <JobCostingPanel projectId={projectId} />}
      {can("finance.view") && <DrawRequestsPanel projectId={projectId} />}
      <ProjectCashFlowPanel projectId={projectId} />
      {can("contracts.view") && <ContractsPanel projectId={projectId} />}
      {can("estimates.view") && <CostImpactSummaryPanel projectId={projectId} />}
    </>
  );
}
