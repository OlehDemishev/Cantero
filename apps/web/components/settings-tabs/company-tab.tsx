"use client";

import { useCan } from "@/lib/permissions";
import { CompanySettingsPanel } from "@/components/company-settings-panel";
import { NavItemsSettingsPanel } from "@/components/nav-items-settings-panel";

/** The settings page's "company" tab; loaded on demand by the settings page. */
export function CompanySettingsTab() {
  const can = useCan();
  return (
    <>
      <CompanySettingsPanel isManager={can("settings.company")} />
      <NavItemsSettingsPanel canManage={can("settings.company")} />
    </>
  );
}
