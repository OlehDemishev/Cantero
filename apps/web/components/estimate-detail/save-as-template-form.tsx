"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import type { EstimateSectionProps } from "./types";

/** Saves the estimate's lines as a template for new estimates. */
export function SaveAsTemplateForm({ estimateId, busy, setBusy }: EstimateSectionProps) {
  const t = useTranslations("estimates");
  const tc = useTranslations("common");
  const [templateName, setTemplateName] = useState("");
  const [templateSaved, setTemplateSaved] = useState(false);

  async function saveAsTemplate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setTemplateSaved(false);
    try {
      await apiFetch(`/estimates/${estimateId}/save-as-template`, {
        method: "POST",
        body: JSON.stringify({ name: templateName }),
      });
      setTemplateName("");
      setTemplateSaved(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={saveAsTemplate} className="mt-6 flex flex-col gap-2 border-t border-gray-100 dark:border-gray-700 pt-4">
      <span className="text-xs font-medium text-fg-subtle">{t("saveAsTemplate")}</span>
      <input
        required
        placeholder={t("templateName")} aria-label={t("templateName")}
        className="input"
        value={templateName}
        onChange={(e) => {
          setTemplateName(e.target.value);
          setTemplateSaved(false);
        }}
      />
      <button type="submit" disabled={busy} className="btn-secondary">
        {t("saveAsTemplate")}
      </button>
      {templateSaved && <p className="text-xs text-success-fg">{tc("saved")}</p>}
    </form>
  );
}
