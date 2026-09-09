"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { formatDate } from "@/lib/format-date";

interface ExpiringRegistration {
  id: string;
  scope: string;
  manufacturer: string | null;
  expirationDate: string;
  project: { id: string; name: string };
}

export function WarrantyExpiringPanel() {
  const t = useTranslations("warrantyRegistry");
  const [items, setItems] = useState<ExpiringRegistration[] | null>(null);

  useEffect(() => {
    apiFetch<ExpiringRegistration[]>("/warranty-registrations/expiring?days=90").then(setItems);
  }, []);

  if (!items || items.length === 0) return null;

  return (
    <div className="mt-10">
      <h2 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("expiringTitle")}</h2>
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{t("expiringHint")}</p>
      <div className="card overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
              <th className="py-1.5">{t("scope")}</th>
              <th>{t("project")}</th>
              <th className="text-right">{t("expiresOn2")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id} className="border-b border-gray-100 dark:border-gray-700">
                <td className="py-1.5 font-medium text-gray-900 dark:text-gray-50">
                  {r.scope}
                  {r.manufacturer && <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500">({r.manufacturer})</span>}
                </td>
                <td>{r.project.name}</td>
                <td className="text-right">{formatDate(new Date(r.expirationDate))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
