"use client";

import { useCan } from "@/lib/permissions";
import { PermitsPanel } from "@/components/permits-panel";
import { SuretyBondsPanel } from "@/components/surety-bonds-panel";
import { ContractClaimsPanel } from "@/components/contract-claims-panel";
import { WarrantyRegistrationsPanel } from "@/components/warranty-registrations-panel";
import { HazmatInventoryPanel } from "@/components/hazmat-inventory-panel";
import { LienCompliancePanel } from "@/components/lien-compliance-panel";
import { EnvironmentalPanel } from "@/components/environmental-panel";
import { CertifiedPayrollPanel } from "@/components/certified-payroll-panel";
import { GreenCertificationsPanel } from "@/components/green-certifications-panel";
import { CarbonReportPanel } from "@/components/carbon-report-panel";

/** The project's "Compliance" tab; loaded on demand by ProjectDetail. */
export function ComplianceTab({ projectId }: { projectId: string }) {
  const can = useCan();
  return (
    <>
      {can("site.manage") && <PermitsPanel projectId={projectId} />}
      {can("finance.view") && <SuretyBondsPanel projectId={projectId} />}
      {can("contracts.view") && <ContractClaimsPanel projectId={projectId} />}
      {can("site.manage") && <WarrantyRegistrationsPanel projectId={projectId} />}
      {can("site.manage") && <HazmatInventoryPanel projectId={projectId} />}
      {can("finance.view") && <LienCompliancePanel projectId={projectId} />}
      {can("site.manage") && <EnvironmentalPanel projectId={projectId} />}
      {can("hr.payroll") && <CertifiedPayrollPanel projectId={projectId} />}
      {can("site.manage") && <GreenCertificationsPanel projectId={projectId} />}
      {can("site.manage") && <CarbonReportPanel projectId={projectId} />}
    </>
  );
}
