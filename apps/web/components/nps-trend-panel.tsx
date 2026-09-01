"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";

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
  const [data, setData] = useState<NpsTrend | null>(null);

  useEffect(() => {
    apiFetch<NpsTrend>("/nps-surveys/trend").then(setData);
  }, []);

  if (!data || data.totalResponses === 0) return null;

  const scoreColor = data.npsScore! >= 50 ? "text-success-700" : data.npsScore! >= 0 ? "text-amber-600" : "text-error-700";

  return (
    <div className="mt-8">
      <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("title")}</h2>
      <div className="card grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{t("npsScore")}</div>
          <div className={`mt-1 text-2xl font-semibold ${scoreColor}`}>{data.npsScore}</div>
        </div>
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{t("averageScore")}</div>
          <div className="mt-1 text-2xl font-semibold text-gray-900">{data.averageScore}</div>
        </div>
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{t("responses")}</div>
          <div className="mt-1 text-2xl font-semibold text-gray-900">{data.totalResponses}</div>
        </div>
        <div className="flex flex-col justify-center gap-0.5 text-xs text-gray-500">
          <span>{t("promoters")}: {data.promoters}</span>
          <span>{t("passives")}: {data.passives}</span>
          <span>{t("detractors")}: {data.detractors}</span>
        </div>
      </div>

      {data.responses.some((r) => r.comment) && (
        <div className="card mt-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{t("recentComments")}</h3>
          <ul className="flex flex-col gap-2">
            {data.responses
              .filter((r) => r.comment)
              .slice(-5)
              .reverse()
              .map((r) => (
                <li key={r.projectId} className="text-sm">
                  <span className="mr-1 rounded-full bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-700">{r.score}</span>
                  <span className="text-gray-700">{r.comment}</span>
                  <span className="ml-1 text-xs text-gray-400">— {r.projectName}</span>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
