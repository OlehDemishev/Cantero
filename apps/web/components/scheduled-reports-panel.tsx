"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  SCHEDULED_REPORT_FREQUENCIES,
  SCHEDULED_REPORT_TYPES,
  type ScheduledReportFrequency,
  type ScheduledReportType,
} from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";
import { formatDate } from "@/lib/format-date";

interface ScheduledReport {
  id: string;
  name: string;
  reportType: ScheduledReportType;
  frequency: ScheduledReportFrequency;
  recipientEmails: string[];
  active: boolean;
  nextRunAt: string;
  lastSentAt: string | null;
}

export function ScheduledReportsPanel() {
  const t = useTranslations("reports");
  const tc = useTranslations("common");
  const [scheduledReports, setScheduledReports] = useState<ScheduledReport[] | null>(null);
  const [scheduleForm, setScheduleForm] = useState({
    name: "",
    reportType: "overview" as ScheduledReportType,
    frequency: "weekly" as ScheduledReportFrequency,
    recipientEmails: "",
  });
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [sentNowId, setSentNowId] = useState<string | null>(null);

  function load() {
    apiFetch<ScheduledReport[]>("/scheduled-reports").then(setScheduledReports);
  }

  useEffect(load, []);

  async function createScheduledReport(e: React.FormEvent) {
    e.preventDefault();
    const recipientEmails = scheduleForm.recipientEmails
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (recipientEmails.length === 0) return;
    setScheduleBusy(true);
    try {
      await apiFetch("/scheduled-reports", {
        method: "POST",
        body: JSON.stringify({ name: scheduleForm.name, reportType: scheduleForm.reportType, frequency: scheduleForm.frequency, recipientEmails }),
      });
      setScheduleForm({ name: "", reportType: "overview", frequency: "weekly", recipientEmails: "" });
      load();
    } finally {
      setScheduleBusy(false);
    }
  }

  async function toggleScheduledReportActive(report: ScheduledReport) {
    await apiFetch(`/scheduled-reports/${report.id}`, { method: "PATCH", body: JSON.stringify({ active: !report.active }) });
    load();
  }

  async function deleteScheduledReport(id: string) {
    await apiFetch(`/scheduled-reports/${id}`, { method: "DELETE" });
    load();
  }

  async function sendScheduledReportNow(id: string) {
    setSentNowId(null);
    await apiFetch(`/scheduled-reports/${id}/send-now`, { method: "POST" });
    setSentNowId(id);
  }

  return (
    <>
      <h2 className="mb-3 mt-10 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("scheduledReports")}</h2>
      <div className="card max-w-xl">
        <form onSubmit={createScheduledReport} className="flex flex-col gap-3">
          <input
            required
            placeholder={t("scheduleName")}
            className="input"
            value={scheduleForm.name}
            onChange={(e) => setScheduleForm((f) => ({ ...f, name: e.target.value }))}
          />
          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-200">{t("reportType")}</span>
              <select
                className="input"
                value={scheduleForm.reportType}
                onChange={(e) => setScheduleForm((f) => ({ ...f, reportType: e.target.value as ScheduledReportType }))}
              >
                {SCHEDULED_REPORT_TYPES.map((ty) => (
                  <option key={ty} value={ty}>
                    {t(`reportType_${ty}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-1 flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-200">{t("frequency")}</span>
              <select
                className="input"
                value={scheduleForm.frequency}
                onChange={(e) => setScheduleForm((f) => ({ ...f, frequency: e.target.value as ScheduledReportFrequency }))}
              >
                {SCHEDULED_REPORT_FREQUENCIES.map((freq) => (
                  <option key={freq} value={freq}>
                    {t(`frequency_${freq}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700 dark:text-gray-200">{t("recipientEmails")}</span>
            <input
              required
              placeholder={t("recipientEmailsPlaceholder")}
              className="input"
              value={scheduleForm.recipientEmails}
              onChange={(e) => setScheduleForm((f) => ({ ...f, recipientEmails: e.target.value }))}
            />
          </label>
          <button type="submit" disabled={scheduleBusy} className="btn-primary self-start">
            {t("createSchedule")}
          </button>
        </form>
      </div>

      {!scheduledReports ? (
        <p className="mt-4 text-gray-500 dark:text-gray-400">{tc("loading")}</p>
      ) : scheduledReports.length === 0 ? (
        <p className="mt-4 text-sm text-gray-400 dark:text-gray-500">{t("noScheduledReports")}</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {scheduledReports.map((report) => (
            <li key={report.id} className="card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-50">{report.name}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        report.active ? "bg-success-50 dark:bg-success-500/15 text-success-700 dark:text-success-500" : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                      }`}
                    >
                      {report.active ? t("active") : t("paused")}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {t(`reportType_${report.reportType}`)} · {t(`frequency_${report.frequency}`)} · {report.recipientEmails.join(", ")}
                  </div>
                  <div className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                    {t("nextRun", { date: formatDate(new Date(report.nextRunAt)) })}
                    {report.lastSentAt && ` · ${t("lastSent", { date: formatDate(new Date(report.lastSentAt)) })}`}
                  </div>
                  {sentNowId === report.id && <p className="mt-1 text-xs text-success-700 dark:text-success-500">{t("sentNowConfirmation")}</p>}
                </div>
                <div className="flex flex-none flex-col gap-1.5">
                  <button onClick={() => sendScheduledReportNow(report.id)} className="btn-secondary px-2.5 py-1 text-xs">
                    {t("sendNow")}
                  </button>
                  <button onClick={() => toggleScheduledReportActive(report)} className="btn-secondary px-2.5 py-1 text-xs">
                    {report.active ? t("pause") : t("resume")}
                  </button>
                  <button onClick={() => deleteScheduledReport(report.id)} className="text-xs text-gray-400 dark:text-gray-500 hover:text-error-600">
                    {tc("delete")}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
