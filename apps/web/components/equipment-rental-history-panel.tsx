"use client";

import { useTranslations } from "next-intl";
import { useApi } from "@/lib/use-api";
import { formatDate } from "@/lib/format-date";
import { formatCurrency } from "@/lib/format-currency";
import { Badge } from "@/components/ui/badge";

interface Rental {
  id: string;
  renterName: string;
  renterContact: string | null;
  dailyRate: string;
  startDate: string;
  expectedReturnDate: string | null;
  actualReturnDate: string | null;
  notes: string | null;
  daysElapsed: number;
  revenue: number;
}

export function EquipmentRentalHistoryPanel({ equipmentId, currency }: { equipmentId: string; currency: string }) {
  const t = useTranslations("equipment");
  const { data: rentals = null } = useApi<Rental[]>(`/equipment/${equipmentId}/rentals`);

  return (
    <section className="card lg:col-span-2">
      <h2 className="mb-1 text-sm font-semibold text-fg-muted">{t("rentalHistory")}</h2>
      <p className="mb-3 text-xs text-fg-subtle">{t("rentalHistoryHint")}</p>
      {!rentals || rentals.length === 0 ? (
        <p className="text-sm text-fg-subtle">{t("noRentals")}</p>
      ) : (
        <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-fg-subtle">
              <th className="py-2">{t("renter")}</th>
              <th>{t("dailyRate")}</th>
              <th>{t("rentalStart")}</th>
              <th>{t("rentalReturn")}</th>
              <th className="text-right">{t("rentalRevenue")}</th>
            </tr>
          </thead>
          <tbody>
            {rentals.map((r) => (
              <tr key={r.id} className="border-b border-gray-100 dark:border-gray-700">
                <td className="py-2">
                  {r.renterName}
                  {!r.actualReturnDate && (
                    <Badge tone="brand" size="sm" className="ml-1.5">
                      {t("rentalActive")}
                    </Badge>
                  )}
                </td>
                <td>
                  {formatCurrency(r.dailyRate, currency)}
                </td>
                <td>{formatDate(new Date(r.startDate))}</td>
                <td>{r.actualReturnDate ? formatDate(new Date(r.actualReturnDate)) : t("stillOut")}</td>
                <td className="text-right font-medium">
                  {formatCurrency(r.revenue, currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </section>
  );
}
