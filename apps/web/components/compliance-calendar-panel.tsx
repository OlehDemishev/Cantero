"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { formatDate } from "@/lib/format-date";

type ComplianceItemType = "subcontractor_document" | "supplier_document" | "worker_certification" | "permit" | "company_document";
type ComplianceStatus = "expired" | "expiring";
interface ComplianceItem {
  type: ComplianceItemType;
  label: string;
  holderName: string | null;
  expiresAt: string;
  status: ComplianceStatus;
}
interface ComplianceCalendar {
  items: ComplianceItem[];
  expiredCount: number;
  expiringCount: number;
}

export function ComplianceCalendarPanel() {
  const t = useTranslations("complianceCalendar");
  const [data, setData] = useState<ComplianceCalendar | null>(null);
  const [lookaheadDays, setLookaheadDays] = useState(90);

  function load() {
    apiFetch<ComplianceCalendar>(`/reports/compliance-calendar?lookaheadDays=${lookaheadDays}`).then(setData);
  }

  useEffect(load, [lookaheadDays]);

  if (data === null) return null;

  return (
    <div className="mt-10">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t("title")}</h2>
        <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          {t("lookahead")}
          <select className="input w-auto py-1 text-xs" value={lookaheadDays} onChange={(e) => setLookaheadDays(Number(e.target.value))}>
            <option value={30}>{t("days", { n: 30 })}</option>
            <option value={60}>{t("days", { n: 60 })}</option>
            <option value={90}>{t("days", { n: 90 })}</option>
            <option value={180}>{t("days", { n: 180 })}</option>
          </select>
        </label>
      </div>
      <div className="card">
        {(data.expiredCount > 0 || data.expiringCount > 0) && (
          <div className="mb-3 flex flex-wrap gap-2 text-xs">
            {data.expiredCount > 0 && (
              <span className="rounded-full bg-error-50 dark:bg-error-500/15 px-2.5 py-1 font-medium text-error-700 dark:text-error-500">
                {t("expiredCount", { count: data.expiredCount })}
              </span>
            )}
            {data.expiringCount > 0 && (
              <span className="rounded-full bg-warning-50 dark:bg-warning-500/15 px-2.5 py-1 font-medium text-warning-700 dark:text-warning-500">
                {t("expiringCount", { count: data.expiringCount })}
              </span>
            )}
          </div>
        )}

        {data.items.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">{t("empty")}</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                <th className="py-1.5">{t("item")}</th>
                <th>{t("type")}</th>
                <th>{t("holder")}</th>
                <th>{t("expiresAt")}</th>
                <th>{t("status")}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item, i) => (
                <tr key={i} className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-1.5">{item.label}</td>
                  <td className="text-xs text-gray-500 dark:text-gray-400">{t(`type_${item.type}`)}</td>
                  <td className="text-xs text-gray-500 dark:text-gray-400">{item.holderName ?? "—"}</td>
                  <td className="text-xs text-gray-500 dark:text-gray-400">{formatDate(new Date(item.expiresAt))}</td>
                  <td>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        item.status === "expired" ? "bg-error-50 dark:bg-error-500/15 text-error-700 dark:text-error-500" : "bg-warning-50 dark:bg-warning-500/15 text-warning-700 dark:text-warning-500"
                      }`}
                    >
                      {t(item.status)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
