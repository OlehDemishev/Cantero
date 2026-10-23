"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { useTranslations } from "next-intl";
import { SUPPORTED_CURRENCIES } from "@cantero/shared";
import type { CompanyFormSectionProps } from "./company-form";

/** Automatic reminders, follow-ups and surveys, the review link and the reporting currency. */
export function AutomationsSection({ companyForm, setCompanyForm, isManager }: CompanyFormSectionProps) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [enpsBusy, setEnpsBusy] = useState(false);
  const [enpsSentMessage, setEnpsSentMessage] = useState<string | null>(null);

  async function sendEnpsNow() {
    setEnpsBusy(true);
    setEnpsSentMessage(null);
    try {
      const result = await apiFetch<{ sent: number }>("/enps-surveys/send-now", { method: "POST" });
      setEnpsSentMessage(t("enpsSentCount", { count: result.sent }));
    } finally {
      setEnpsBusy(false);
    }
  }

  return (
    <>
      <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
        <label className="flex items-start gap-2 text-xs text-fg-muted">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={companyForm.npsDetractorFollowUpEnabled}
            onChange={(e) => setCompanyForm((f) => ({ ...f, npsDetractorFollowUpEnabled: e.target.checked }))}
            disabled={!isManager}
          />
          <span>
            <span className="font-medium text-fg-muted">{t("npsDetractorFollowUpEnabled")}</span>
            <span className="mt-0.5 block text-fg-subtle">{t("npsDetractorFollowUpEnabledHint")}</span>
          </span>
        </label>
      </div>
      <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
        <label className="flex items-start gap-2 text-xs text-fg-muted">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={companyForm.invoiceRemindersEnabled}
            onChange={(e) => setCompanyForm((f) => ({ ...f, invoiceRemindersEnabled: e.target.checked }))}
            disabled={!isManager}
          />
          <span>
            <span className="font-medium text-fg-muted">{t("invoiceReminders")}</span>
            <span className="mt-0.5 block text-fg-subtle">{t("invoiceRemindersHint")}</span>
          </span>
        </label>
      </div>
      <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
        <label className="flex items-start gap-2 text-xs text-fg-muted">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={companyForm.estimateRemindersEnabled}
            onChange={(e) => setCompanyForm((f) => ({ ...f, estimateRemindersEnabled: e.target.checked }))}
            disabled={!isManager}
          />
          <span>
            <span className="font-medium text-fg-muted">{t("estimateReminders")}</span>
            <span className="mt-0.5 block text-fg-subtle">{t("estimateRemindersHint")}</span>
          </span>
        </label>
      </div>
      <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
        <label className="flex items-start gap-2 text-xs text-fg-muted">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={companyForm.changeOrderRemindersEnabled}
            onChange={(e) => setCompanyForm((f) => ({ ...f, changeOrderRemindersEnabled: e.target.checked }))}
            disabled={!isManager}
          />
          <span>
            <span className="font-medium text-fg-muted">{t("changeOrderReminders")}</span>
            <span className="mt-0.5 block text-fg-subtle">{t("changeOrderRemindersHint")}</span>
          </span>
        </label>
      </div>
      <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
        <label className="flex items-start gap-2 text-xs text-fg-muted">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={companyForm.enpsSurveysEnabled}
            onChange={(e) => setCompanyForm((f) => ({ ...f, enpsSurveysEnabled: e.target.checked }))}
            disabled={!isManager}
          />
          <span>
            <span className="font-medium text-fg-muted">{t("enpsSurveys")}</span>
            <span className="mt-0.5 block text-fg-subtle">{t("enpsSurveysHint")}</span>
          </span>
        </label>
        {companyForm.enpsSurveysEnabled && (
          <button type="button" onClick={sendEnpsNow} disabled={enpsBusy} className="btn-secondary mt-2 px-2 py-1 text-xs">
            {enpsSentMessage ?? t("enpsSendNow")}
          </button>
        )}
      </div>
      <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
        <label className="flex items-start gap-2 text-xs text-fg-muted">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={companyForm.workerSmsNotificationsEnabled}
            onChange={(e) => setCompanyForm((f) => ({ ...f, workerSmsNotificationsEnabled: e.target.checked }))}
            disabled={!isManager}
          />
          <span>
            <span className="font-medium text-fg-muted">{t("workerSmsNotifications")}</span>
            <span className="mt-0.5 block text-fg-subtle">{t("workerSmsNotificationsHint")}</span>
          </span>
        </label>
      </div>
      <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
        <label className="flex items-start gap-2 text-xs text-fg-muted">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={companyForm.leadFollowUpEnabled}
            onChange={(e) => setCompanyForm((f) => ({ ...f, leadFollowUpEnabled: e.target.checked }))}
            disabled={!isManager}
          />
          <span>
            <span className="font-medium text-fg-muted">{t("leadFollowUp")}</span>
            <span className="mt-0.5 block text-fg-subtle">{t("leadFollowUpHint")}</span>
          </span>
        </label>
      </div>
      <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
        <label className="flex flex-col gap-1 text-xs text-fg-muted">
          <span className="font-medium text-fg-muted">{t("reviewRequestUrl")}</span>
          <span className="text-fg-subtle">{t("reviewRequestUrlHint")}</span>
          <input
            type="url"
            className="input mt-1"
            placeholder="https://g.page/r/your-business/review"
            value={companyForm.reviewRequestUrl}
            onChange={(e) => setCompanyForm((f) => ({ ...f, reviewRequestUrl: e.target.value }))}
            disabled={!isManager}
          />
        </label>
      </div>
      <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
        <label className="flex flex-col gap-1 text-xs text-fg-muted">
          <span className="font-medium text-fg-muted">{t("reportingCurrency")}</span>
          <span className="text-fg-subtle">{t("reportingCurrencyHint")}</span>
          <select
            className="input mt-1"
            value={companyForm.reportingCurrency}
            onChange={(e) => setCompanyForm((f) => ({ ...f, reportingCurrency: e.target.value }))}
            disabled={!isManager}
          >
            <option value="">{tc("none")}</option>
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>
    </>
  );
}
