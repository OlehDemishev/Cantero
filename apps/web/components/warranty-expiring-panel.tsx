"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";

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
      <h2 className="mb-1 text-sm font-semibold text-gray-700">{t("expiringTitle")}</h2>
      <p className="mb-3 text-xs text-gray-500">{t("expiringHint")}</p>
      <div className="card overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-1.5">{t("scope")}</th>
              <th>{t("project")}</th>
              <th className="text-right">{t("expiresOn2")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id} className="border-b border-gray-100">
                <td className="py-1.5 font-medium text-gray-900">
                  {r.scope}
                  {r.manufacturer && <span className="ml-1.5 text-xs text-gray-400">({r.manufacturer})</span>}
                </td>
                <td>{r.project.name}</td>
                <td className="text-right">{new Date(r.expirationDate).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
