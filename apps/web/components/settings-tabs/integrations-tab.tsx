"use client";

import { useCan } from "@/lib/permissions";
import { ApiKeysPanel } from "@/components/api-keys-panel";
import { WebhooksPanel } from "@/components/webhooks-panel";
import { AccountingSyncPanel } from "@/components/accounting-sync-panel";
import { DocusignSettingsPanel } from "@/components/docusign-settings-panel";
import { IntacctSettingsPanel } from "@/components/intacct-settings-panel";
import { MsProjectSettingsPanel } from "@/components/ms-project-settings-panel";
import { AutodeskSettingsPanel } from "@/components/autodesk-settings-panel";
import { IntegrationsPanel } from "@/components/integrations-panel";

/** The settings page's "integrations" tab; loaded on demand by the settings page. */
export function IntegrationsSettingsTab({ isManager }: { isManager: boolean }) {
  const can = useCan();
  return (
    <>
      {isManager && <ApiKeysPanel />}
      {can("settings.integrations") && <WebhooksPanel />}
      <AccountingSyncPanel canManage={can("finance.manage")} />
      <DocusignSettingsPanel canManage={can("settings.integrations")} />
      <IntacctSettingsPanel canManage={can("finance.manage")} />
      <MsProjectSettingsPanel canManage={can("settings.integrations")} />
      <AutodeskSettingsPanel canManage={can("settings.integrations")} />
      <IntegrationsPanel canManage={can("settings.company")} />
    </>
  );
}
