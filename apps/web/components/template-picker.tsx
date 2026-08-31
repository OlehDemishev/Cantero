"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { ChecklistTemplateType } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";

interface Template {
  id: string;
  name: string;
  defaultSubject: string | null;
  defaultBody: string | null;
  defaultHazards: string | null;
  defaultControlMeasures: string | null;
  defaultPpe: string | null;
}
export interface TemplateSelection {
  subject: string;
  body: string;
  hazards: string;
  controlMeasures: string;
  ppe: string;
}

/** A small "prefill from template" dropdown for rfi/safety_briefing/jha forms — selecting a
 * template copies its default* fields into the form via onSelect; there's nothing to "apply"
 * server-side for these types, unlike punch_list templates. Every field is always passed so a
 * caller that only uses subject/body (rfi, safety_briefing) can ignore the rest. */
export function TemplatePicker({
  type,
  onSelect,
}: {
  type: Extract<ChecklistTemplateType, "rfi" | "safety_briefing" | "jha">;
  onSelect: (selection: TemplateSelection) => void;
}) {
  const t = useTranslations("checklistTemplates");
  const [templates, setTemplates] = useState<Template[]>([]);

  useEffect(() => {
    apiFetch<Template[]>(`/checklist-templates?type=${type}`).then(setTemplates);
  }, [type]);

  if (templates.length === 0) return null;

  return (
    <select
      className="input"
      value=""
      onChange={(e) => {
        const template = templates.find((tpl) => tpl.id === e.target.value);
        if (template) {
          onSelect({
            subject: template.defaultSubject ?? "",
            body: template.defaultBody ?? "",
            hazards: template.defaultHazards ?? "",
            controlMeasures: template.defaultControlMeasures ?? "",
            ppe: template.defaultPpe ?? "",
          });
        }
      }}
    >
      <option value="">{t("useTemplate")}</option>
      {templates.map((tpl) => (
        <option key={tpl.id} value={tpl.id}>
          {tpl.name}
        </option>
      ))}
    </select>
  );
}
