"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { LOCALE_NAMES, SUPPORTED_LOCALES } from "@cantero/shared";
import { apiFetch, notifyApiError } from "@/lib/api-client";
import { CompanyHolidaysPanel } from "@/components/company-holidays-panel";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import {
  EMPTY_COMPANY_FORM,
  companyFormToPatch,
  companyToForm,
  type Company,
  type CompanyForm,
} from "@/components/company-settings/company-form";
import { AccountingSection } from "@/components/company-settings/accounting-section";
import { ApprovalsSection } from "@/components/company-settings/approvals-section";
import { PaymentsLaborSection } from "@/components/company-settings/payments-labor-section";
import { OperationsSection } from "@/components/company-settings/operations-section";
import { AutomationsSection } from "@/components/company-settings/automations-section";
import { BrandingSection } from "@/components/company-settings/branding-section";

/**
 * The company's settings: one form, saved with one PATCH, whose sections live in
 * components/company-settings/ and edit the shared form state; branding uploads the logo on its own.
 */
export function CompanySettingsPanel({ isManager }: { isManager: boolean }) {
  const t = useTranslations("settings");

  const [companyForm, setCompanyForm] = useState<CompanyForm>(EMPTY_COMPANY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Company>("/company").then((c) => {
      setCompanyForm(companyToForm(c));
    }).catch(notifyApiError);
  }, []);

  async function saveCompany(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/company", {
        method: "PATCH",
        body: JSON.stringify(companyFormToPatch(companyForm)),
      });
      // The company's language applies to whoever hasn't picked their own (Settings → Account).
      const me = await apiFetch<{ locale: string }>("/me");
      document.cookie = `NEXT_LOCALE=${me.locale};path=/;max-age=31536000`;
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  const sectionProps = { companyForm, setCompanyForm, isManager };

  return (
    <section className="card">
      <h2 className="mb-4 text-sm font-semibold text-fg-muted">{t("company")}</h2>
      {!isManager && <p className="mb-3 text-xs text-fg-subtle">{t("companySettingsManagerOnlyHint")}</p>}
      {error && <Alert tone="danger" className="mb-3">{error}</Alert>}
      <form onSubmit={saveCompany} className="flex flex-col gap-3">
        <Field label={t("companyName")} size="sm">
          <input
            required
            className="input"
            value={companyForm.name}
            onChange={(e) => setCompanyForm((f) => ({ ...f, name: e.target.value }))}
            disabled={!isManager}
          />
        </Field>
        <Field label={t("language")} size="sm">
          <select
            className="input"
            value={companyForm.locale}
            onChange={(e) => setCompanyForm((f) => ({ ...f, locale: e.target.value }))}
            disabled={!isManager}
          >
            {SUPPORTED_LOCALES.map((l) => (
              <option key={l} value={l}>
                {LOCALE_NAMES[l]}
              </option>
            ))}
          </select>
        </Field>
        <AccountingSection {...sectionProps} />
        <ApprovalsSection {...sectionProps} />
        <PaymentsLaborSection {...sectionProps} />
        <CompanyHolidaysPanel canManage={isManager} />
        <OperationsSection {...sectionProps} />
        <AutomationsSection {...sectionProps} />
        {isManager && (
          <button type="submit" disabled={busy} className="btn-primary">
            {t("save")}
          </button>
        )}
      </form>

      <BrandingSection {...sectionProps} />
    </section>
  );
}
