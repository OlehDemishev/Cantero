"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { TabNav, type TabNavItem } from "@/components/ui/tab-nav";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { apiFetch } from "@/lib/api-client";
import { useCan } from "@/lib/permissions";
import { useMe } from "@/lib/use-me";
import { NotificationPreferencesPanel } from "@/components/notification-preferences-panel";
import { LanguagePanel } from "@/components/language-panel";
import { CompanySettingsPanel } from "@/components/company-settings-panel";
import { NavItemsSettingsPanel } from "@/components/nav-items-settings-panel";
import { BillingPlanPanel } from "@/components/billing-plan-panel";
import { FranchisePanel } from "@/components/franchise-panel";
import { TeamMembersPanel } from "@/components/team-members-panel";
import { CustomRolesPanel } from "@/components/custom-roles-panel";
import { RolePermissionsPanel } from "@/components/role-permissions-panel";
import { TeamInvitesPanel } from "@/components/team-invites-panel";
import { ApiKeysPanel } from "@/components/api-keys-panel";
import { WebhooksPanel } from "@/components/webhooks-panel";
import { AuditLogPanel } from "@/components/audit-log-panel";
import { GobdCompliancePanel } from "@/components/gobd-compliance-panel";
import { CustomFieldsSettingsPanel } from "@/components/custom-fields-settings-panel";
import { LeadFormSettingsPanel } from "@/components/lead-form-settings-panel";
import { CustomPortalDomainPanel } from "@/components/custom-portal-domain-panel";
import { SsoSettingsPanel } from "@/components/sso-settings-panel";
import { DataPrivacyPanel } from "@/components/data-privacy-panel";
import { DeletedDocumentsPanel } from "@/components/deleted-documents-panel";
import { AccountingSyncPanel } from "@/components/accounting-sync-panel";
import { DocusignSettingsPanel } from "@/components/docusign-settings-panel";
import { IntacctSettingsPanel } from "@/components/intacct-settings-panel";
import { MsProjectSettingsPanel } from "@/components/ms-project-settings-panel";
import { AutodeskSettingsPanel } from "@/components/autodesk-settings-panel";
import { TwoFactorSettingsPanel } from "@/components/two-factor-settings-panel";
import { SessionsPanel } from "@/components/sessions-panel";
import { IntegrationsPanel } from "@/components/integrations-panel";
import { OnboardingTemplatePanel } from "@/components/onboarding-template-panel";
import { OffboardingTemplatePanel } from "@/components/offboarding-template-panel";
import { TrainingCatalogPanel } from "@/components/training-catalog-panel";
import { BondingCapacityPanel } from "@/components/bonding-capacity-panel";
import { MarketingCampaignsPanel } from "@/components/marketing-campaigns-panel";
import { SlaPoliciesPanel } from "@/components/sla-policies-panel";
import { TaxJurisdictionsPanel } from "@/components/tax-jurisdictions-panel";
import { BenefitPlansPanel } from "@/components/benefit-plans-panel";
import { InspectionTemplatesPanel } from "@/components/inspection-templates-panel";
import { CostCodesPanel } from "@/components/cost-codes-panel";
import { WageClassificationsPanel } from "@/components/wage-classifications-panel";
import { MarkupRulesPanel } from "@/components/markup-rules-panel";
import { SecuritySettingsPanel } from "@/components/security-settings-panel";
import { ReferralProgramPanel } from "@/components/referral-program-panel";
import { CompanyCoiPanel } from "@/components/company-coi-panel";
import { MessageTemplatesPanel } from "@/components/message-templates-panel";

const SETTINGS_TAB_KEYS = [
  "account",
  "company",
  "billing",
  "team",
  "security",
  "integrations",
  "templates",
  "operations",
  "marketing",
] as const;
type SettingsTabKey = (typeof SETTINGS_TAB_KEYS)[number];

export default function SettingsPage() {
  const t = useTranslations("settings");
  const { data: me } = useMe();
  // Billing, franchise, API keys, SSO and deleting the company stay with owner and admin (fixed on the
  // API); every other panel follows the permission its API needs.
  const isManager = me?.user.role === "owner" || me?.user.role === "admin";
  const can = useCan();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabFromParam = searchParams.get("tab");
  const activeTab: SettingsTabKey =
    tabFromParam && (SETTINGS_TAB_KEYS as readonly string[]).includes(tabFromParam) ? (tabFromParam as SettingsTabKey) : "account";
  function setTab(key: string) {
    router.replace(`/settings?tab=${key}`, { scroll: false });
  }
  const showOperations = can("site.manage") || can("templates.field") || can("pricing.manage") || can("hr.payroll");
  const visibleTabKeys = SETTINGS_TAB_KEYS.filter((key) => key !== "operations" || showOperations);
  const TABS: TabNavItem[] = visibleTabKeys.map((key) => ({ key, label: t(`tab_${key}`) }));

  const [leadFormToken, setLeadFormToken] = useState<string | null>(null);
  function loadLeadFormToken() {
    apiFetch<{ publicLeadFormToken: string | null }>("/company").then((c) => setLeadFormToken(c.publicLeadFormToken));
  }
  useEffect(loadLeadFormToken, []);

  return (
    <AuthenticatedShell>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      <TabNav tabs={TABS} active={activeTab} onChange={setTab} />

      {activeTab === "account" && <LanguagePanel />}
      {activeTab === "account" && <NotificationPreferencesPanel />}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {activeTab === "company" && <CompanySettingsPanel isManager={can("settings.company")} />}

        {activeTab === "company" && <NavItemsSettingsPanel canManage={can("settings.company")} />}

        {activeTab === "billing" && <BillingPlanPanel isManager={!!isManager} />}

        {activeTab === "billing" && isManager && <FranchisePanel />}

        {activeTab === "team" && <TeamMembersPanel isManager={can("settings.roles")} />}

        {activeTab === "team" && <RolePermissionsPanel />}

        {activeTab === "team" && <CustomRolesPanel isManager={can("settings.roles")} />}

        {activeTab === "team" && can("settings.roles") && <TeamInvitesPanel />}

        {activeTab === "integrations" && isManager && <ApiKeysPanel />}

        {activeTab === "integrations" && can("settings.integrations") && <WebhooksPanel />}

        {activeTab === "templates" && <MessageTemplatesPanel />}

        {activeTab === "templates" && <CustomFieldsSettingsPanel canManage={can("templates.company")} />}

        {activeTab === "templates" && <LeadFormSettingsPanel token={leadFormToken} canManage={can("settings.company")} onChange={loadLeadFormToken} />}

        {activeTab === "marketing" && <CustomPortalDomainPanel canManage={can("settings.company")} />}

        {activeTab === "team" && <SsoSettingsPanel canManage={isManager} />}

        {activeTab === "integrations" && <AccountingSyncPanel canManage={can("finance.manage")} />}

        {activeTab === "integrations" && <DocusignSettingsPanel canManage={can("settings.integrations")} />}

        {activeTab === "integrations" && <IntacctSettingsPanel canManage={can("finance.manage")} />}

        {activeTab === "integrations" && <MsProjectSettingsPanel canManage={can("settings.integrations")} />}

        {activeTab === "integrations" && <AutodeskSettingsPanel canManage={can("settings.integrations")} />}

        {activeTab === "team" && <TwoFactorSettingsPanel />}

        {activeTab === "team" && <SessionsPanel />}

        {activeTab === "security" && <SecuritySettingsPanel canManage={can("settings.company")} />}

        {activeTab === "integrations" && <IntegrationsPanel canManage={can("settings.company")} />}

        {activeTab === "security" && <DataPrivacyPanel canExport={can("settings.export")} canDelete={!!isManager} />}

        {activeTab === "security" && can("documents.delete") && <DeletedDocumentsPanel />}

        {activeTab === "marketing" && <ReferralProgramPanel />}

        {activeTab === "security" && <CompanyCoiPanel canManage={can("templates.company")} />}

        {activeTab === "security" && can("settings.export") && <AuditLogPanel />}

        {activeTab === "security" && can("finance.export") && <GobdCompliancePanel />}

        {activeTab === "templates" && can("templates.company") && <OnboardingTemplatePanel />}
        {activeTab === "templates" && can("templates.company") && <OffboardingTemplatePanel />}
        {activeTab === "templates" && can("training.manage") && <TrainingCatalogPanel />}
        {activeTab === "billing" && can("finance.view") && <BondingCapacityPanel />}
        {activeTab === "marketing" && can("finance.manage") && <MarketingCampaignsPanel />}
        {activeTab === "operations" && can("site.manage") && <SlaPoliciesPanel />}
        {activeTab === "billing" && can("finance.manage") && <TaxJurisdictionsPanel />}
        {activeTab === "team" && can("hr.payroll") && <BenefitPlansPanel />}
        {activeTab === "operations" && can("templates.field") && <InspectionTemplatesPanel />}
        {activeTab === "operations" && can("pricing.manage") && <CostCodesPanel />}
        {activeTab === "operations" && can("hr.payroll") && <WageClassificationsPanel />}
        {activeTab === "operations" && can("pricing.manage") && <MarkupRulesPanel />}
      </div>
    </AuthenticatedShell>
  );
}
