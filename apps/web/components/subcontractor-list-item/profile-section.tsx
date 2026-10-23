"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useCan } from "@/lib/permissions";
import type { SubcontractorSectionProps } from "./types";

/** The prequalification profile, and whether (and where) it is listed publicly. */
export function ProfileSection({ subcontractor: s, busy, setBusy, onChanged }: SubcontractorSectionProps) {
  const t = useTranslations("subcontractorCompliance");
  const tc = useTranslations("common");
  const [profileForm, setProfileForm] = useState({
    specialization: s.specialization ?? "",
    bio: s.bio ?? "",
    licenseNumber: s.licenseNumber ?? "",
    bondingCapacity: s.bondingCapacity ?? "",
    safetyProgramSummary: s.safetyProgramSummary ?? "",
  });
  const [linkCopied, setLinkCopied] = useState(false);
  const can = useCan();

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/finance/subcontractors/${s.id}/profile`, {
        method: "PATCH",
        body: JSON.stringify({
          specialization: profileForm.specialization || null,
          bio: profileForm.bio || null,
          licenseNumber: profileForm.licenseNumber || null,
          bondingCapacity: profileForm.bondingCapacity ? Number(profileForm.bondingCapacity) : null,
          safetyProgramSummary: profileForm.safetyProgramSummary || null,
        }),
      });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function togglePublic(publicListed: boolean) {
    setBusy(true);
    try {
      await apiFetch(`/finance/subcontractors/${s.id}/public-listed`, {
        method: "PATCH",
        body: JSON.stringify({ publicListed }),
      });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  // The token isn't in the list response (anyone with subcontractors.view sees that) — it's
  // fetched from the manage-only endpoint when someone actually copies the link.
  async function copyLink() {
    const { token } = await apiFetch<{ token: string }>(`/finance/subcontractors/${s.id}/public-link`);
    await navigator.clipboard.writeText(`${window.location.origin}/subcontractor-profile/${token}`);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  return (
    <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t("prequalification")}</h3>
      <p className="mb-2 text-xs text-fg-subtle">{t("prequalificationHint")}</p>
      <form onSubmit={saveProfile} className="flex flex-col gap-2">
        <input
          placeholder={t("specializationPlaceholder")} aria-label={t("specializationPlaceholder")}
          className="input"
          value={profileForm.specialization}
          onChange={(e) => setProfileForm((f) => ({ ...f, specialization: e.target.value }))}
        />
        <textarea
          rows={2}
          placeholder={t("bioPlaceholder")} aria-label={t("bioPlaceholder")}
          className="input"
          value={profileForm.bio}
          onChange={(e) => setProfileForm((f) => ({ ...f, bio: e.target.value }))}
        />
        <div className="flex flex-wrap gap-2">
          <input
            placeholder={t("licenseNumberPlaceholder")} aria-label={t("licenseNumberPlaceholder")}
            className="input"
            value={profileForm.licenseNumber}
            onChange={(e) => setProfileForm((f) => ({ ...f, licenseNumber: e.target.value }))}
          />
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder={t("bondingCapacityPlaceholder")} aria-label={t("bondingCapacityPlaceholder")}
            className="input w-40"
            value={profileForm.bondingCapacity}
            onChange={(e) => setProfileForm((f) => ({ ...f, bondingCapacity: e.target.value }))}
          />
        </div>
        <textarea
          rows={2}
          placeholder={t("safetyProgramPlaceholder")} aria-label={t("safetyProgramPlaceholder")}
          className="input"
          value={profileForm.safetyProgramSummary}
          onChange={(e) => setProfileForm((f) => ({ ...f, safetyProgramSummary: e.target.value }))}
        />
        <button type="submit" disabled={busy} className="btn-secondary self-start px-2.5 py-1 text-xs">
          {tc("save")}
        </button>
      </form>
      <div className="mt-2 flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-fg-muted">
          <input
            type="checkbox"
            checked={s.publicListed}
            onChange={(e) => togglePublic(e.target.checked)}
            disabled={busy}
          />
          {t("makePublic")}
        </label>
        {s.publicListed && can("subcontractors.manage") && (
          <button onClick={copyLink} className="btn-secondary px-2 py-0.5 text-xs">
            {linkCopied ? tc("saved") : t("copyPublicLink")}
          </button>
        )}
      </div>
    </div>
  );
}
