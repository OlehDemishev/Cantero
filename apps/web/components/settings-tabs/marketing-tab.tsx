"use client";

import { useCan } from "@/lib/permissions";
import { CustomPortalDomainPanel } from "@/components/custom-portal-domain-panel";
import { ReferralProgramPanel } from "@/components/referral-program-panel";
import { MarketingCampaignsPanel } from "@/components/marketing-campaigns-panel";

/** The settings page's "marketing" tab; loaded on demand by the settings page. */
export function MarketingSettingsTab() {
  const can = useCan();
  return (
    <>
      <CustomPortalDomainPanel canManage={can("settings.company")} />
      <ReferralProgramPanel />
      {can("finance.manage") && <MarketingCampaignsPanel />}
    </>
  );
}
