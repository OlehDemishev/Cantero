"use client";

import { useTranslations } from "next-intl";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chartColors, chartAxisProps, chartGridProps, chartTooltipProps } from "@/components/charts/chart-theme";
import { useApi } from "@/lib/use-api";
import { useCan } from "@/lib/permissions";
import { PanelErrorState } from "@/components/ui/error-state";
import { Badge } from "@/components/ui/badge";

interface EnpsComment {
  comment: string | null;
  score: number | null;
  respondedAt: string;
}
interface EnpsTrend {
  enpsScore: number | null;
  averageScore: number | null;
  totalResponses: number;
  promoters: number;
  passives: number;
  detractors: number;
  comments: EnpsComment[];
}
interface EnpsMonthBucket {
  month: string;
  enpsScore: number | null;
  responseCount: number;
}

export function EnpsTrendPanel() {
  const t = useTranslations("enpsTrend");
  const canSee = useCan()("hr.cases");
  const { data = null, error, reload } = useApi<EnpsTrend>(canSee ? "/enps-surveys/trend" : null);
  const { data: history = null } = useApi<EnpsMonthBucket[]>(canSee ? "/enps-surveys/trend-by-period" : null);

  if (!canSee) return null;
  if (error && !data) return <PanelErrorState title={t("title")} error={error} onRetry={reload} className="mt-8" />;
  if (!data || data.totalResponses === 0) return null;

  const scoreColor = data.enpsScore! >= 50 ? "text-success-fg" : data.enpsScore! >= 0 ? "text-warning-fg" : "text-danger-fg";
  const monthsWithData = history?.filter((m) => m.responseCount > 0) ?? [];

  return (
    <div className="mt-8">
      <h2 className="mb-3 text-sm font-semibold text-fg-muted">{t("title")}</h2>
      <div className="card grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-fg-subtle">{t("enpsScore")}</div>
          <div className={`mt-1 text-2xl font-semibold ${scoreColor}`}>{data.enpsScore}</div>
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

      {monthsWithData.length > 1 && (
        <div className="card mt-3 h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={history!}>
              <CartesianGrid {...chartGridProps} />
              <XAxis dataKey="month" {...chartAxisProps} />
              <YAxis domain={[-100, 100]} {...chartAxisProps} />
              <Tooltip {...chartTooltipProps} />
              <Bar dataKey="enpsScore" fill={chartColors.primary} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {data.comments.length > 0 && (
        <div className="card mt-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t("recentComments")}</h3>
          <ul className="flex flex-col gap-2">
            {data.comments.slice(0, 5).map((c, i) => (
              <li key={i} className="text-sm">
                <Badge tone="neutral" size="sm" className="mr-1">{c.score}</Badge>
                <span className="text-fg-muted">{c.comment}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
