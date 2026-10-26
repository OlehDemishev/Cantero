"use client";

import { useCan } from "@/lib/permissions";
import { TeamMembersPanel } from "@/components/team-members-panel";
import { RolePermissionsPanel } from "@/components/role-permissions-panel";
import { CustomRolesPanel } from "@/components/custom-roles-panel";
import { TeamInvitesPanel } from "@/components/team-invites-panel";
import { SsoSettingsPanel } from "@/components/sso-settings-panel";
import { TwoFactorSettingsPanel } from "@/components/two-factor-settings-panel";
import { SessionsPanel } from "@/components/sessions-panel";
import { BenefitPlansPanel } from "@/components/benefit-plans-panel";

/** The settings page's "team" tab; loaded on demand by the settings page. */
export function TeamSettingsTab({ isManager }: { isManager: boolean }) {
  const can = useCan();
  return (
    <>
      <TeamMembersPanel isManager={can("settings.roles")} />
      <RolePermissionsPanel />
      <CustomRolesPanel isManager={can("settings.roles")} />
      {can("settings.roles") && <TeamInvitesPanel />}
      <SsoSettingsPanel canManage={isManager} />
      <TwoFactorSettingsPanel />
      <SessionsPanel />
      {can("hr.payroll") && <BenefitPlansPanel />}
    </>
  );
}
