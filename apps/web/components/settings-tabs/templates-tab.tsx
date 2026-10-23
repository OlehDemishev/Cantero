"use client";

import { useCan } from "@/lib/permissions";
import { MessageTemplatesPanel } from "@/components/message-templates-panel";
import { CustomFieldsSettingsPanel } from "@/components/custom-fields-settings-panel";
import { LeadFormSettingsPanel } from "@/components/lead-form-settings-panel";
import { OnboardingTemplatePanel } from "@/components/onboarding-template-panel";
import { OffboardingTemplatePanel } from "@/components/offboarding-template-panel";
import { TrainingCatalogPanel } from "@/components/training-catalog-panel";

/** The settings page's "templates" tab; loaded on demand by the settings page. */
export function TemplatesSettingsTab({ leadFormToken, onLeadFormChange }: { leadFormToken: string | null; onLeadFormChange: () => void }) {
  const can = useCan();
  return (
    <>
      <MessageTemplatesPanel />
      <CustomFieldsSettingsPanel canManage={can("templates.company")} />
      <LeadFormSettingsPanel token={leadFormToken} canManage={can("settings.company")} onChange={onLeadFormChange} />
      {can("templates.company") && <OnboardingTemplatePanel />}
      {can("templates.company") && <OffboardingTemplatePanel />}
      {can("training.manage") && <TrainingCatalogPanel />}
    </>
  );
}
