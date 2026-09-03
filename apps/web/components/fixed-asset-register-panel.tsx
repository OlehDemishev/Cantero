"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";

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
  const [entries, setEntries] = useState<RegisterEntry[] | null>(null);

  useEffect(() => {
    apiFetch<RegisterEntry[]>("/equipment/fixed-asset-register").then(setEntries);
  }, []);

  if (!entries || entries.length === 0) return null;

  return (
    <div className="mt-10">
      <h2 className="mb-1 text-sm font-semibold text-gray-700">{t("title")}</h2>
      <p className="mb-3 text-xs text-gray-500">{t("description")}</p>
      <div className="card overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-1.5">{t("asset")}</th>
              <th>{t("purchaseCost")}</th>
              <th>{t("accumulatedDepreciation")}</th>
              <th>{t("bookValue")}</th>
              <th>{t("status")}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-b border-gray-100">
                <td className="py-1.5">
                  <a href={`/equipment/${e.id}`} className="font-medium text-gray-900 hover:underline">
                    {e.name}
                  </a>
                  <span className="ml-1 text-xs text-gray-400">{e.category}</span>
                </td>
                <td>
                  {e.purchaseCost} {currency}
                </td>
                <td>{e.depreciation ? `${e.depreciation.accumulatedDepreciation} ${currency}` : "—"}</td>
                <td className="font-medium">{e.depreciation ? `${e.depreciation.bookValue} ${currency}` : "—"}</td>
                <td>
                  {e.disposal ? (
                    <span className="rounded-full bg-error-50 px-2 py-0.5 text-xs font-medium text-error-700">
                      {t("disposed", { date: new Date(e.disposal.disposedAt).toLocaleDateString() })}
                    </span>
                  ) : e.depreciation ? (
                    <span className="rounded-full bg-success-50 px-2 py-0.5 text-xs font-medium text-success-700">{t("tracked")}</span>
                  ) : (
                    <span className="text-xs text-gray-400">{t("noSchedule")}</span>
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
