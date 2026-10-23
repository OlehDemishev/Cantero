"use client";

import { useTranslations } from "next-intl";
import { useApi } from "@/lib/use-api";
import { useMe } from "@/lib/use-me";
import { formatCurrency } from "@/lib/format-currency";

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
  const tl = useTranslations("labels");
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "";
  const { data: rows = null } = useApi<ChannelRoi[]>("/marketing/roi-by-channel");

  if (!rows || rows.length === 0) return null;

  return (
    <div className="mt-10">
      <h2 className="mb-1 text-sm font-semibold text-fg-muted">{t("roiTitle")}</h2>
      <p className="mb-3 text-xs text-fg-subtle">{t("roiHint")}</p>
      <div className="card overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-fg-subtle">
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
              <tr key={r.channel} className="border-b border-gray-100 dark:border-gray-700">
                <td className="py-1.5 font-medium text-fg">{r.channel === "unattributed" ? tl("channelUnattributed") : r.channel}</td>
                <td>{r.leadCount}</td>
                <td>{r.wonCount}</td>
                <td>{r.conversionRatePercent}%</td>
                <td>{r.costPerLead !== null ? `${formatCurrency(r.costPerLead, currency)}` : "—"}</td>
                <td>{r.costPerWonDeal !== null ? `${formatCurrency(r.costPerWonDeal, currency)}` : "—"}</td>
                <td className="text-right font-medium">
                  {formatCurrency(r.wonValue, currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
