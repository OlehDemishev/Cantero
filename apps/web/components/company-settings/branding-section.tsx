"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, apiUpload } from "@/lib/api-client";
import { Alert } from "@/components/ui/alert";
import type { CompanyFormSectionProps } from "./company-form";

/** The brand colour (saved with the form) and the company logo (uploaded on its own). */
export function BrandingSection({ companyForm, setCompanyForm, isManager }: CompanyFormSectionProps) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);

  function loadLogo() {
    apiFetch<Blob>("/company/logo")
      .then((blob) => setLogoUrl(URL.createObjectURL(blob)))
      .catch(() => setLogoUrl(null));
  }

  useEffect(() => {
    loadLogo();
  }, []);

  async function uploadLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoBusy(true);
    setLogoError(null);
    try {
      await apiUpload("/company/logo", file);
      loadLogo();
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : tc("error"));
    } finally {
      setLogoBusy(false);
      e.target.value = "";
    }
  }

  return (
    <div className="mt-6 border-t border-gray-100 dark:border-gray-700 pt-4">
      <h3 className="mb-1 text-sm font-semibold text-fg-muted">{t("branding")}</h3>
      <p className="mb-3 text-xs text-fg-subtle">{t("brandingHint")}</p>
      {logoError && <Alert tone="danger" className="mb-3">{logoError}</Alert>}
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-xs text-fg-subtle">
          {t("brandColor")}
          <div className="mt-1 flex items-center gap-2">
            <input
              type="color"
              className="h-9 w-14 cursor-pointer rounded border border-gray-200 dark:border-gray-700"
              value={companyForm.brandColor ?? "#465fff"}
              onChange={(e) => setCompanyForm((f) => ({ ...f, brandColor: e.target.value }))}
              disabled={!isManager}
            />
            {companyForm.brandColor && isManager && (
              <button
                type="button"
                onClick={() => setCompanyForm((f) => ({ ...f, brandColor: null }))}
                className="btn-secondary px-2 py-1 text-xs"
              >
                {t("resetBrandColor")}
              </button>
            )}
          </div>
        </label>
        <div className="flex items-center gap-3">
          {logoUrl ? (
            <img src={logoUrl} alt={t("logo")} className="h-12 max-w-[120px] rounded border border-gray-200 dark:border-gray-700 object-contain" />
          ) : (
            <span className="text-xs text-fg-subtle">{t("noLogo")}</span>
          )}
          {isManager && (
            <label className="btn-secondary cursor-pointer px-3 py-1 text-xs">
              {logoBusy ? tc("loading") : t("uploadLogo")}
              <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={uploadLogo} disabled={logoBusy} />
            </label>
          )}
        </div>
      </div>
    </div>
  );
}
