"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { TabNav, TabPanel, type TabNavItem } from "@/components/ui/tab-nav";
import { apiFetch, notifyApiError } from "@/lib/api-client";
import { useCan } from "@/lib/permissions";
import { useMe } from "@/lib/use-me";
import { NotificationPreferencesPanel } from "@/components/notification-preferences-panel";
import { LanguagePanel } from "@/components/language-panel";
import { AppearancePanel } from "@/components/appearance-panel";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";

// One tab shows at a time: every tab but "account" (the default) is its own chunk, fetched when it is
// first opened, with a skeleton in its place meanwhile.
function TabLoading() {
  return <Skeleton lines={4} />;
}
const CompanySettingsTab = dynamic(() => import("@/components/settings-tabs/company-tab").then((m) => m.CompanySettingsTab), { loading: TabLoading });
const BillingSettingsTab = dynamic(() => import("@/components/settings-tabs/billing-tab").then((m) => m.BillingSettingsTab), { loading: TabLoading });
const TeamSettingsTab = dynamic(() => import("@/components/settings-tabs/team-tab").then((m) => m.TeamSettingsTab), { loading: TabLoading });
const SecuritySettingsTab = dynamic(() => import("@/components/settings-tabs/security-tab").then((m) => m.SecuritySettingsTab), { loading: TabLoading });
const IntegrationsSettingsTab = dynamic(() => import("@/components/settings-tabs/integrations-tab").then((m) => m.IntegrationsSettingsTab), {
  loading: TabLoading,
});
const TemplatesSettingsTab = dynamic(() => import("@/components/settings-tabs/templates-tab").then((m) => m.TemplatesSettingsTab), { loading: TabLoading });
const OperationsSettingsTab = dynamic(() => import("@/components/settings-tabs/operations-tab").then((m) => m.OperationsSettingsTab), { loading: TabLoading });
const MarketingSettingsTab = dynamic(() => import("@/components/settings-tabs/marketing-tab").then((m) => m.MarketingSettingsTab), { loading: TabLoading });

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
    apiFetch<{ publicLeadFormToken: string | null }>("/company").then((c) => setLeadFormToken(c.publicLeadFormToken)).catch(notifyApiError);
  }
  useEffect(loadLeadFormToken, []);

  return (
    <>
      <PageHeader title={t("title")} />

      <TabNav id="settings-tabs" tabs={TABS} active={activeTab} onChange={setTab} />
      <TabPanel tabsId="settings-tabs" active={activeTab}>

        {activeTab === "account" && <LanguagePanel />}
        {activeTab === "account" && <AppearancePanel />}
        {activeTab === "account" && <NotificationPreferencesPanel />}

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {activeTab === "company" && <CompanySettingsTab />}
          {activeTab === "billing" && <BillingSettingsTab isManager={!!isManager} />}
          {activeTab === "team" && <TeamSettingsTab isManager={!!isManager} />}
          {activeTab === "security" && <SecuritySettingsTab isManager={!!isManager} />}
          {activeTab === "integrations" && <IntegrationsSettingsTab isManager={!!isManager} />}
          {activeTab === "templates" && <TemplatesSettingsTab leadFormToken={leadFormToken} onLeadFormChange={loadLeadFormToken} />}
          {activeTab === "operations" && <OperationsSettingsTab />}
          {activeTab === "marketing" && <MarketingSettingsTab />}
        </div>
      </TabPanel>
    </>
  );
}
