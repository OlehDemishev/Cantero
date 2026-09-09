"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { formatDate } from "@/lib/format-date";

type CertStatus = "expired" | "expiring_soon" | "valid";

interface CertRow {
  id: string;
  name: string;
  expiresAt: string;
  status: CertStatus;
  worker: { id: string; name: string; role: string | null };
}
interface CertDashboard {
  certifications: CertRow[];
  summary: { expired: number; expiringSoon: number; valid: number };
}

const badgeClass: Record<CertStatus, string> = {
  expired: "bg-error-50 dark:bg-error-500/15 text-error-700 dark:text-error-500",
  expiring_soon: "bg-amber-50 text-amber-700",
  valid: "bg-success-50 dark:bg-success-500/15 text-success-700 dark:text-success-500",
};

export function CertificationsDashboardPanel() {
  const t = useTranslations("team");
  const tc = useTranslations("common");
  const [dashboard, setDashboard] = useState<CertDashboard | null>(null);

  useEffect(() => {
    apiFetch<CertDashboard>("/workers/certifications/dashboard").then(setDashboard);
  }, []);

  return (
    <div className="mt-10">
      <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("certificationsDashboard")}</h2>
      {!dashboard ? (
        <p className="text-gray-500 dark:text-gray-400">{tc("loading")}</p>
      ) : dashboard.certifications.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">—</p>
      ) : (
        <>
          <div className="mb-3 flex gap-4 text-xs text-gray-500 dark:text-gray-400">
            <span>{t("certExpired", { count: dashboard.summary.expired })}</span>
            <span>{t("certExpiringSoon", { count: dashboard.summary.expiringSoon })}</span>
            <span>{t("certValid", { count: dashboard.summary.valid })}</span>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                <th className="py-2">{tc("name")}</th>
                <th>{t("certification")}</th>
                <th>{t("expires")}</th>
                <th>{tc("status")}</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.certifications.map((c) => (
                <tr key={c.id} className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-2">
                    <a href={`/team/${c.worker.id}`} className="text-brand-700 dark:text-brand-400 hover:underline">
                      {c.worker.name}
                    </a>
                  </td>
                  <td>{c.name}</td>
                  <td>{formatDate(new Date(c.expiresAt))}</td>
                  <td>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${badgeClass[c.status]}`}>{t(`certStatus_${c.status}`)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </>
      )}
    </div>
  );
}
