"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { TabNav, type TabNavItem } from "@/components/ui/tab-nav";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";
import { NotificationPreferencesPanel } from "@/components/notification-preferences-panel";
import { CompanySettingsPanel } from "@/components/company-settings-panel";
import { NavItemsSettingsPanel } from "@/components/nav-items-settings-panel";
import { BillingPlanPanel } from "@/components/billing-plan-panel";
import { FranchisePanel } from "@/components/franchise-panel";
import { TeamMembersPanel } from "@/components/team-members-panel";
import { CustomRolesPanel } from "@/components/custom-roles-panel";
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
  const isManager = me?.user.role === "owner" || me?.user.role === "admin";
  const canManageAccounting = isManager || me?.user.role === "accountant";
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabFromParam = searchParams.get("tab");
  const activeTab: SettingsTabKey =
    tabFromParam && (SETTINGS_TAB_KEYS as readonly string[]).includes(tabFromParam) ? (tabFromParam as SettingsTabKey) : "account";
  function setTab(key: string) {
    router.replace(`/settings?tab=${key}`, { scroll: false });
  }
  const visibleTabKeys = SETTINGS_TAB_KEYS.filter((key) => key !== "operations" || isManager);
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

      {activeTab === "account" && <NotificationPreferencesPanel />}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {activeTab === "company" && <CompanySettingsPanel isManager={!!isManager} />}

        {activeTab === "company" && <NavItemsSettingsPanel canManage={!!isManager} />}

        {activeTab === "billing" && <BillingPlanPanel isManager={!!isManager} />}

        {activeTab === "billing" && isManager && <FranchisePanel />}

        {activeTab === "team" && <TeamMembersPanel isManager={!!isManager} />}

        {activeTab === "team" && <CustomRolesPanel isManager={!!isManager} />}

        {activeTab === "team" && isManager && <TeamInvitesPanel />}

        {activeTab === "integrations" && isManager && <ApiKeysPanel />}

        {activeTab === "integrations" && isManager && <WebhooksPanel />}

        {activeTab === "templates" && <MessageTemplatesPanel />}

        {activeTab === "templates" && <CustomFieldsSettingsPanel canManage={isManager} />}

        {activeTab === "templates" && <LeadFormSettingsPanel token={leadFormToken} canManage={isManager} onChange={loadLeadFormToken} />}

        {activeTab === "marketing" && <CustomPortalDomainPanel canManage={isManager} />}

        {activeTab === "team" && <SsoSettingsPanel canManage={isManager} />}

        {activeTab === "integrations" && <AccountingSyncPanel canManage={canManageAccounting} />}

        {activeTab === "integrations" && <DocusignSettingsPanel canManage={isManager} />}

        {activeTab === "integrations" && <IntacctSettingsPanel canManage={canManageAccounting} />}

        {activeTab === "integrations" && <MsProjectSettingsPanel canManage={isManager} />}

        {activeTab === "integrations" && <AutodeskSettingsPanel canManage={isManager} />}

        {activeTab === "team" && <TwoFactorSettingsPanel />}

        {activeTab === "team" && <SessionsPanel />}

        {activeTab === "security" && <SecuritySettingsPanel canManage={isManager} />}

        {activeTab === "integrations" && <IntegrationsPanel canManage={isManager} />}

        {activeTab === "security" && <DataPrivacyPanel canManage={isManager} />}

        {activeTab === "security" && isManager && <DeletedDocumentsPanel />}

        {activeTab === "marketing" && <ReferralProgramPanel />}

        {activeTab === "security" && <CompanyCoiPanel canManage={isManager} />}

        {activeTab === "security" && isManager && <AuditLogPanel />}

        {activeTab === "security" && canManageAccounting && <GobdCompliancePanel />}

        {activeTab === "templates" && isManager && <OnboardingTemplatePanel />}
        {activeTab === "templates" && isManager && <OffboardingTemplatePanel />}
        {activeTab === "templates" && isManager && <TrainingCatalogPanel />}
        {activeTab === "billing" && isManager && <BondingCapacityPanel />}
        {activeTab === "marketing" && isManager && <MarketingCampaignsPanel />}
        {activeTab === "operations" && isManager && <SlaPoliciesPanel />}
        {activeTab === "billing" && isManager && <TaxJurisdictionsPanel />}
        {activeTab === "team" && isManager && <BenefitPlansPanel />}
        {activeTab === "operations" && isManager && <InspectionTemplatesPanel />}
        {activeTab === "operations" && isManager && <CostCodesPanel />}
        {activeTab === "operations" && isManager && <WageClassificationsPanel />}
        {activeTab === "operations" && isManager && <MarkupRulesPanel />}
      </div>
    </AuthenticatedShell>
  );
}
