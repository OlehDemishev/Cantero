"use client";

import { useTranslations } from "next-intl";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chartColors, chartAxisProps, chartGridProps, chartTooltipProps } from "@/components/charts/chart-theme";
import { useApi } from "@/lib/use-api";
import { formatDate } from "@/lib/format-date";

interface NpsResponse {
  projectId: string;
  projectName: string;
  score: number;
  comment: string | null;
  respondedAt: string;
}
interface NpsTrend {
  npsScore: number | null;
  averageScore: number | null;
  totalResponses: number;
  promoters: number;
  passives: number;
  detractors: number;
  responses: NpsResponse[];
}

export function NpsTrendPanel() {
  const t = useTranslations("npsTrend");
  const { data = null } = useApi<NpsTrend>("/nps-surveys/trend");

  if (!data || data.totalResponses === 0) return null;

  const scoreColor = data.npsScore! >= 50 ? "text-success-fg" : data.npsScore! >= 0 ? "text-amber-600" : "text-danger-fg";

  return (
    <div className="mt-8">
      <h2 className="mb-3 text-sm font-semibold text-fg-muted">{t("title")}</h2>
      <div className="card grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-fg-subtle">{t("npsScore")}</div>
          <div className={`mt-1 text-2xl font-semibold ${scoreColor}`}>{data.npsScore}</div>
        </div>
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-fg-subtle">{t("averageScore")}</div>
          <div className="mt-1 text-2xl font-semibold text-fg">{data.averageScore}</div>
        </div>
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-fg-subtle">{t("responses")}</div>
          <div className="mt-1 text-2xl font-semibold text-fg">{data.totalResponses}</div>
        </div>
        <div className="flex flex-col justify-center gap-0.5 text-xs text-fg-subtle">
          <span>{t("promoters")}: {data.promoters}</span>
          <span>{t("passives")}: {data.passives}</span>
          <span>{t("detractors")}: {data.detractors}</span>
        </div>
      </div>

      {data.responses.length > 1 && (
        <div className="card mt-3 h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.responses.map((r) => ({ date: formatDate(new Date(r.respondedAt)), score: r.score }))}>
              <CartesianGrid {...chartGridProps} />
              <XAxis dataKey="date" {...chartAxisProps} />
              <YAxis domain={[0, 10]} {...chartAxisProps} />
              <Tooltip {...chartTooltipProps} />
              <Line type="monotone" dataKey="score" stroke={chartColors.primary} strokeWidth={2} dot={{ r: 3, fill: "var(--color-surface)" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {data.responses.some((r) => r.comment) && (
        <div className="card mt-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t("recentComments")}</h3>
          <ul className="flex flex-col gap-2">
            {data.responses
              .filter((r) => r.comment)
              .slice(-5)
              .reverse()
              .map((r) => (
                <li key={r.projectId} className="text-sm">
                  <span className="mr-1 rounded-full bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 text-xs font-medium text-fg-muted">{r.score}</span>
                  <span className="text-fg-muted">{r.comment}</span>
                  <span className="ml-1 text-xs text-fg-subtle">— {r.projectName}</span>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
