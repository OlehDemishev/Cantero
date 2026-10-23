"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { resetStateInEffect } from "@/lib/effect-reset";
import type { EstimateSectionProps } from "./types";

/** The cover letter sent with a draft estimate. */
export function CoverLetterEditor({ estimateId, estimate, reload }: EstimateSectionProps) {
  const t = useTranslations("estimates");
  const tc = useTranslations("common");
  const [coverLetterDraft, setCoverLetterDraft] = useState(estimate.coverLetter ?? "");
  const [savingCoverLetter, setSavingCoverLetter] = useState(false);

  // Every load of the estimate starts the draft from what is saved.
  useEffect(() => {
    resetStateInEffect(() => setCoverLetterDraft(estimate.coverLetter ?? ""));
  }, [estimate]);

  async function saveCoverLetter() {
    setSavingCoverLetter(true);
    try {
      await apiFetch(`/estimates/${estimateId}/cover-letter`, {
        method: "PATCH",
        body: JSON.stringify({ coverLetter: coverLetterDraft || null }),
      });
      reload();
    } finally {
      setSavingCoverLetter(false);
    }
  }

  return (
    <div className="mt-4 border-t border-gray-100 dark:border-gray-700 pt-4">
      <label className="text-xs font-medium text-fg-subtle">{t("coverLetter")}</label>
      <textarea
        className="input mt-2 w-full"
        rows={4}
        placeholder={t("coverLetterPlaceholder")} aria-label={t("coverLetterPlaceholder")}
        value={coverLetterDraft}
        onChange={(e) => setCoverLetterDraft(e.target.value)}
      />
      <button
        onClick={saveCoverLetter}
        disabled={savingCoverLetter || coverLetterDraft === (estimate.coverLetter ?? "")}
        className="btn-secondary mt-2 px-3 py-1 text-xs"
      >
        {tc("save")}
      </button>
    </div>
  );
}
