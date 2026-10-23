"use client";

import { useCan } from "@/lib/permissions";
import { BillingPlanPanel } from "@/components/billing-plan-panel";
import { StripeConnectPanel } from "@/components/stripe-connect-panel";
import { FranchisePanel } from "@/components/franchise-panel";
import { BondingCapacityPanel } from "@/components/bonding-capacity-panel";
import { TaxJurisdictionsPanel } from "@/components/tax-jurisdictions-panel";

/** The settings page's "billing" tab; loaded on demand by the settings page. */
export function BillingSettingsTab({ isManager }: { isManager: boolean }) {
  const can = useCan();
  return (
    <>
      <BillingPlanPanel isManager={!!isManager} />
      {isManager && <StripeConnectPanel />}
      {isManager && <FranchisePanel />}
      {can("finance.view") && <BondingCapacityPanel />}
      {can("finance.manage") && <TaxJurisdictionsPanel />}
    </>
  );
}
