"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";

type ClientStage = "lead" | "contacted" | "qualified" | "won" | "lost";

interface ForecastDeal {
  clientId: string;
  name: string;
  stage: ClientStage;
  estimatedValue: number;
  probability: number;
  expectedCloseDate: string | null;
  weightedValue: number;
}
interface Forecast {
  totalWeightedValue: number;
  unscheduledWeightedValue: number;
  byMonth: { month: string; weightedValue: number }[];
  deals: ForecastDeal[];
}
interface FunnelStage {
  stage: ClientStage;
  everReachedCount: number;
  avgDaysInStage: number | null;
}
interface Funnel {
  winRatePercent: number | null;
  wonCount: number;
  lostCount: number;
  funnel: FunnelStage[];
}
interface LeaderboardRow {
  ownerWorkerId: string;
  ownerName: string;
  openCount: number;
  openValue: number;
  wonCount: number;
  wonValue: number;
}

export function CrmPipelinePanel() {
  const t = useTranslations("clients");
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "";

  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[] | null>(null);

  useEffect(() => {
    apiFetch<Forecast>("/clients/pipeline-forecast").then(setForecast);
    apiFetch<Funnel>("/clients/funnel-report").then(setFunnel);
    apiFetch<LeaderboardRow[]>("/clients/owner-leaderboard").then(setLeaderboard);
  }, []);

  return (
    <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-3">
      <div>
        <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("pipelineForecast")}</h2>
        {!forecast ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">—</p>
        ) : (
          <>
            <div className="card">
              <div className="text-xs text-gray-500 dark:text-gray-400">{t("weightedPipelineValue")}</div>
              <div className="mt-1 text-lg font-semibold">
                {forecast.totalWeightedValue.toFixed(2)} {currency}
              </div>
              {forecast.unscheduledWeightedValue > 0 && (
                <div className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                  {t("unscheduledWeightedValue", { value: forecast.unscheduledWeightedValue.toFixed(2), currency })}
                </div>
              )}
            </div>
            {forecast.byMonth.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1 text-xs text-gray-600 dark:text-gray-300">
                {forecast.byMonth.map((m) => (
                  <li key={m.month} className="flex justify-between">
                    <span>{m.month}</span>
                    <span className="font-medium">
                      {m.weightedValue.toFixed(2)} {currency}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("funnelReport")}</h2>
        {!funnel ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">—</p>
        ) : (
          <>
            <div className="card">
              <div className="text-xs text-gray-500 dark:text-gray-400">{t("winRate")}</div>
              <div className="mt-1 text-lg font-semibold">
                {funnel.winRatePercent !== null ? `${funnel.winRatePercent.toFixed(0)}%` : "—"}
              </div>
              <div className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                {t("winLossCount", { won: funnel.wonCount, lost: funnel.lostCount })}
              </div>
            </div>
            <ul className="mt-2 flex flex-col gap-1 text-xs text-gray-600 dark:text-gray-300">
              {funnel.funnel.map((f) => (
                <li key={f.stage} className="flex justify-between">
                  <span>{t(f.stage)}</span>
                  <span>
                    {f.everReachedCount}
                    {f.avgDaysInStage !== null && ` · ${t("avgDays", { days: f.avgDaysInStage.toFixed(1) })}`}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("ownerLeaderboard")}</h2>
        {!leaderboard ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">—</p>
        ) : leaderboard.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">—</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {leaderboard.map((row) => (
              <li key={row.ownerWorkerId} className="card">
                <div className="text-sm font-medium">{row.ownerName}</div>
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {t("wonSummary", { count: row.wonCount, value: row.wonValue.toFixed(2), currency })}
                </div>
                <div className="text-xs text-gray-400 dark:text-gray-500">
                  {t("openSummary", { count: row.openCount, value: row.openValue.toFixed(2), currency })}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
