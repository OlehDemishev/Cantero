"use client";

import { useTranslations } from "next-intl";
import { useApi } from "@/lib/use-api";
import { useCan } from "@/lib/permissions";
import { PanelErrorState } from "@/components/ui/error-state";
import { useMe } from "@/lib/use-me";
import { formatDate } from "@/lib/format-date";
import { formatCurrency } from "@/lib/format-currency";

interface Depreciation {
  monthsElapsed: number;
  accumulatedDepreciation: number;
  bookValue: number;
}
interface Disposal {
  disposedAt: string;
  saleAmount: string | null;
}
interface RegisterEntry {
  id: string;
  name: string;
  category: string;
  purchaseCost: string;
  purchaseDate: string | null;
  depreciation: Depreciation | null;
  disposal: Disposal | null;
}

export function FixedAssetRegisterPanel() {
  const t = useTranslations("fixedAssetRegister");
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "";
  const canSee = useCan()("equipment.costs");
  const { data: entries = null, error, reload } = useApi<RegisterEntry[]>(canSee ? "/equipment/fixed-asset-register" : null);

  if (!canSee) return null;
  if (error && !entries) return <PanelErrorState title={t("title")} error={error} onRetry={reload} />;
  if (!entries || entries.length === 0) return null;

  return (
    <div className="mt-10">
      <h2 className="mb-1 text-sm font-semibold text-fg-muted">{t("title")}</h2>
      <p className="mb-3 text-xs text-fg-subtle">{t("description")}</p>
      <div className="card overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-fg-subtle">
              <th className="py-1.5">{t("asset")}</th>
              <th>{t("purchaseCost")}</th>
              <th>{t("accumulatedDepreciation")}</th>
              <th>{t("bookValue")}</th>
              <th>{t("status")}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-b border-gray-100 dark:border-gray-700">
                <td className="py-1.5">
                  <a href={`/equipment/${e.id}`} className="font-medium text-fg hover:underline">
                    {e.name}
                  </a>
                  <span className="ml-1 text-xs text-fg-subtle">{e.category}</span>
                </td>
                <td>
                  {formatCurrency(e.purchaseCost, currency)}
                </td>
                <td>{e.depreciation ? `${formatCurrency(e.depreciation.accumulatedDepreciation, currency)}` : "—"}</td>
                <td className="font-medium">{e.depreciation ? `${formatCurrency(e.depreciation.bookValue, currency)}` : "—"}</td>
                <td>
                  {e.disposal ? (
                    <span className="rounded-full bg-error-50 dark:bg-error-500/15 px-2 py-0.5 text-xs font-medium text-danger-fg">
                      {t("disposed", { date: formatDate(new Date(e.disposal.disposedAt)) })}
                    </span>
                  ) : e.depreciation ? (
                    <span className="rounded-full bg-success-50 dark:bg-success-500/15 px-2 py-0.5 text-xs font-medium text-success-fg">{t("tracked")}</span>
                  ) : (
                    <span className="text-xs text-fg-subtle">{t("noSchedule")}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
