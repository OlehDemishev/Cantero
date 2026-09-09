"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiFetch } from "@/lib/api-client";

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
  const [data, setData] = useState<EnpsTrend | null>(null);
  const [history, setHistory] = useState<EnpsMonthBucket[] | null>(null);

  useEffect(() => {
    apiFetch<EnpsTrend>("/enps-surveys/trend").then(setData);
    apiFetch<EnpsMonthBucket[]>("/enps-surveys/trend-by-period").then(setHistory);
  }, []);

  if (!data || data.totalResponses === 0) return null;

  const scoreColor = data.enpsScore! >= 50 ? "text-success-700 dark:text-success-500" : data.enpsScore! >= 0 ? "text-amber-600" : "text-error-700 dark:text-error-500";
  const monthsWithData = history?.filter((m) => m.responseCount > 0) ?? [];

  return (
    <div className="mt-8">
      <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("title")}</h2>
      <div className="card grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{t("enpsScore")}</div>
          <div className={`mt-1 text-2xl font-semibold ${scoreColor}`}>{data.enpsScore}</div>
        </div>
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{t("averageScore")}</div>
          <div className="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-50">{data.averageScore}</div>
        </div>
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{t("responses")}</div>
          <div className="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-50">{data.totalResponses}</div>
        </div>
        <div className="flex flex-col justify-center gap-0.5 text-xs text-gray-500 dark:text-gray-400">
          <span>{t("promoters")}: {data.promoters}</span>
          <span>{t("passives")}: {data.passives}</span>
          <span>{t("detractors")}: {data.detractors}</span>
        </div>
      </div>

      {monthsWithData.length > 1 && (
        <div className="card mt-3 h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={history!}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-gray-200, #e5e7eb)" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis domain={[-100, 100]} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="enpsScore" fill="#465fff" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {data.comments.length > 0 && (
        <div className="card mt-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t("recentComments")}</h3>
          <ul className="flex flex-col gap-2">
            {data.comments.slice(0, 5).map((c, i) => (
              <li key={i} className="text-sm">
                <span className="mr-1 rounded-full bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 text-xs font-medium text-gray-700 dark:text-gray-200">{c.score}</span>
                <span className="text-gray-700 dark:text-gray-200">{c.comment}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
