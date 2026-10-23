"use client";

import { useCan } from "@/lib/permissions";
import { SlaPoliciesPanel } from "@/components/sla-policies-panel";
import { InspectionTemplatesPanel } from "@/components/inspection-templates-panel";
import { CostCodesPanel } from "@/components/cost-codes-panel";
import { WageClassificationsPanel } from "@/components/wage-classifications-panel";
import { MarkupRulesPanel } from "@/components/markup-rules-panel";

/** The settings page's "operations" tab; loaded on demand by the settings page. */
export function OperationsSettingsTab() {
  const can = useCan();
  return (
    <>
      {can("site.manage") && <SlaPoliciesPanel />}
      {can("templates.field") && <InspectionTemplatesPanel />}
      {can("pricing.manage") && <CostCodesPanel />}
      {can("hr.payroll") && <WageClassificationsPanel />}
      {can("pricing.manage") && <MarkupRulesPanel />}
    </>
  );
}
