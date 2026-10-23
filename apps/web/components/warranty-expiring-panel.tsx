"use client";

import { useTranslations } from "next-intl";
import { useApi } from "@/lib/use-api";
import { useCan } from "@/lib/permissions";
import { PanelErrorState } from "@/components/ui/error-state";
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
  const canSee = useCan()("site.manage");
  const { data: items = null, error, reload } = useApi<ExpiringRegistration[]>(canSee ? "/warranty-registrations/expiring?days=90" : null);

  if (!canSee) return null;
  if (error && !items) return <PanelErrorState title={t("expiringTitle")} error={error} onRetry={reload} />;
  if (!items || items.length === 0) return null;

  return (
    <div className="mt-10">
      <h2 className="mb-1 text-sm font-semibold text-fg-muted">{t("expiringTitle")}</h2>
      <p className="mb-3 text-xs text-fg-subtle">{t("expiringHint")}</p>
      <div className="card overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-fg-subtle">
              <th className="py-1.5">{t("scope")}</th>
              <th>{t("project")}</th>
              <th className="text-right">{t("expiresOn2")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id} className="border-b border-gray-100 dark:border-gray-700">
                <td className="py-1.5 font-medium text-fg">
                  {r.scope}
                  {r.manufacturer && <span className="ml-1.5 text-xs text-fg-subtle">({r.manufacturer})</span>}
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
