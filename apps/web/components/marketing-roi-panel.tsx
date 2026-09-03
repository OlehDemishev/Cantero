"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";

interface ChannelRoi {
  channel: string;
  leadCount: number;
  wonCount: number;
  wonValue: number;
  conversionRatePercent: number;
  spend: number | null;
  costPerLead: number | null;
  costPerWonDeal: number | null;
}

export function MarketingRoiPanel() {
  const t = useTranslations("marketing");
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "";
  const [rows, setRows] = useState<ChannelRoi[] | null>(null);

  useEffect(() => {
    apiFetch<ChannelRoi[]>("/marketing/roi-by-channel").then(setRows);
  }, []);

  if (!rows || rows.length === 0) return null;

  return (
    <div className="mt-10">
      <h2 className="mb-1 text-sm font-semibold text-gray-700">{t("roiTitle")}</h2>
      <p className="mb-3 text-xs text-gray-500">{t("roiHint")}</p>
      <div className="card overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-1.5">{t("channel")}</th>
              <th>{t("leads")}</th>
              <th>{t("won")}</th>
              <th>{t("conversionRate")}</th>
              <th>{t("costPerLead")}</th>
              <th>{t("costPerWonDeal")}</th>
              <th className="text-right">{t("wonValue")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.channel} className="border-b border-gray-100">
                <td className="py-1.5 font-medium text-gray-900">{r.channel}</td>
                <td>{r.leadCount}</td>
                <td>{r.wonCount}</td>
                <td>{r.conversionRatePercent}%</td>
                <td>{r.costPerLead !== null ? `${r.costPerLead} ${currency}` : "—"}</td>
                <td>{r.costPerWonDeal !== null ? `${r.costPerWonDeal} ${currency}` : "—"}</td>
                <td className="text-right font-medium">
                  {r.wonValue} {currency}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
