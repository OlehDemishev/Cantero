"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { SUBCONTRACTOR_DIVERSITY_CATEGORIES, type SubcontractorDiversityCategory } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";
import { Field } from "@/components/ui/field";
import type { SubcontractorSectionProps } from "./types";

/** The subcontractor's diversity certifications and when they expire. */
export function DiversitySection({ subcontractor: s, busy, setBusy, onChanged }: SubcontractorSectionProps) {
  const t = useTranslations("subcontractorCompliance");
  const tc = useTranslations("common");
  const [diversityForm, setDiversityForm] = useState<{ categories: SubcontractorDiversityCategory[]; expiresAt: string }>({
    categories: s.diversityCertifications ?? [],
    expiresAt: s.diversityCertificationExpiresAt ? s.diversityCertificationExpiresAt.slice(0, 10) : "",
  });

  function toggleDiversityCategory(category: SubcontractorDiversityCategory) {
    setDiversityForm((f) => ({
      ...f,
      categories: f.categories.includes(category) ? f.categories.filter((c) => c !== category) : [...f.categories, category],
    }));
  }

  async function saveDiversityCertifications() {
    setBusy(true);
    try {
      await apiFetch(`/finance/subcontractors/${s.id}/diversity-certifications`, {
        method: "PATCH",
        body: JSON.stringify({
          diversityCertifications: diversityForm.categories,
          diversityCertificationExpiresAt: diversityForm.expiresAt ? new Date(diversityForm.expiresAt).toISOString() : null,
        }),
      });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t("diversityCertifications")}</h3>
      <p className="mb-2 text-xs text-fg-subtle">{t("diversityCertificationsHint")}</p>
      <div className="mb-2 flex flex-wrap gap-3">
        {SUBCONTRACTOR_DIVERSITY_CATEGORIES.map((category) => (
          <label key={category} className="flex items-center gap-1.5 text-xs text-fg-muted">
            <input
              type="checkbox"
              checked={diversityForm.categories.includes(category)}
              onChange={() => toggleDiversityCategory(category)}
            />
            {t(`diversityCategory_${category}`)}
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Field label={t("diversityCertificationExpiresAt")} size="sm">
          <input
            type="date"
            className="input"
            value={diversityForm.expiresAt}
            onChange={(e) => setDiversityForm((f) => ({ ...f, expiresAt: e.target.value }))}
          />
        </Field>
        <button onClick={saveDiversityCertifications} disabled={busy} className="btn-secondary px-2.5 py-1 text-xs">
          {tc("save")}
        </button>
      </div>
    </div>
  );
}
