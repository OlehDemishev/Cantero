"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { formatDate } from "@/lib/format-date";

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
  const [rentals, setRentals] = useState<Rental[] | null>(null);

  useEffect(() => {
    apiFetch<Rental[]>(`/equipment/${equipmentId}/rentals`).then(setRentals);
  }, [equipmentId]);

  return (
    <section className="card lg:col-span-2">
      <h2 className="mb-1 text-sm font-semibold text-gray-700">{t("rentalHistory")}</h2>
      <p className="mb-3 text-xs text-gray-500">{t("rentalHistoryHint")}</p>
      {!rentals || rentals.length === 0 ? (
        <p className="text-sm text-gray-400">{t("noRentals")}</p>
      ) : (
        <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-2">{t("renter")}</th>
              <th>{t("dailyRate")}</th>
              <th>{t("rentalStart")}</th>
              <th>{t("rentalReturn")}</th>
              <th className="text-right">{t("rentalRevenue")}</th>
            </tr>
          </thead>
          <tbody>
            {rentals.map((r) => (
              <tr key={r.id} className="border-b border-gray-100">
                <td className="py-2">
                  {r.renterName}
                  {!r.actualReturnDate && (
                    <span className="ml-1.5 rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium text-brand-700">
                      {t("rentalActive")}
                    </span>
                  )}
                </td>
                <td>
                  {r.dailyRate} {currency}
                </td>
                <td>{formatDate(new Date(r.startDate))}</td>
                <td>{r.actualReturnDate ? formatDate(new Date(r.actualReturnDate)) : t("stillOut")}</td>
                <td className="text-right font-medium">
                  {r.revenue} {currency}
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
