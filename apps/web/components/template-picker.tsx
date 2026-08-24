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
}

/** A small "prefill from template" dropdown for rfi/safety_briefing forms — selecting a template
 * copies its defaultSubject/defaultBody into the form via onSelect; there's nothing to "apply"
 * server-side for these two types, unlike punch_list templates. */
export function TemplatePicker({
  type,
  onSelect,
}: {
  type: Extract<ChecklistTemplateType, "rfi" | "safety_briefing">;
  onSelect: (subject: string, body: string) => void;
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
        if (template) onSelect(template.defaultSubject ?? "", template.defaultBody ?? "");
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
