"use client";

import { useCan } from "@/lib/permissions";
import { BidRequestsPanel } from "@/components/bid-requests-panel";
import { SubcontractorAssignmentsPanel } from "@/components/subcontractor-assignments-panel";
import { SubcontractorCostsPanel } from "@/components/subcontractor-costs-panel";
import { SubcontractorClaimsPanel } from "@/components/subcontractor-claims-panel";

/** The project's "Subcontractors" tab; loaded on demand by ProjectDetail. */
export function SubcontractorsTab({ projectId }: { projectId: string }) {
  const can = useCan();
  return (
    <>
      {can("estimates.view") && <BidRequestsPanel projectId={projectId} />}
      {can("subcontractors.view") && <SubcontractorAssignmentsPanel projectId={projectId} />}
      {can("finance.view") && <SubcontractorCostsPanel projectId={projectId} />}
      {can("subcontractors.view") && <SubcontractorClaimsPanel projectId={projectId} />}
    </>
  );
}
