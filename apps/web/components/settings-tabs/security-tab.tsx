"use client";

import { useCan } from "@/lib/permissions";
import { SecuritySettingsPanel } from "@/components/security-settings-panel";
import { DataPrivacyPanel } from "@/components/data-privacy-panel";
import { DeletedDocumentsPanel } from "@/components/deleted-documents-panel";
import { CompanyCoiPanel } from "@/components/company-coi-panel";
import { AuditLogPanel } from "@/components/audit-log-panel";
import { GobdCompliancePanel } from "@/components/gobd-compliance-panel";

/** The settings page's "security" tab; loaded on demand by the settings page. */
export function SecuritySettingsTab({ isManager }: { isManager: boolean }) {
  const can = useCan();
  return (
    <>
      <SecuritySettingsPanel canManage={can("settings.company")} />
      <DataPrivacyPanel canExport={can("settings.export")} canDelete={!!isManager} />
      {can("documents.delete") && <DeletedDocumentsPanel />}
      <CompanyCoiPanel canManage={can("templates.company")} />
      {can("settings.export") && <AuditLogPanel />}
      {can("finance.export") && <GobdCompliancePanel />}
    </>
  );
}
