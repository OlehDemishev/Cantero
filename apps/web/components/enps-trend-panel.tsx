"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
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

export function EnpsTrendPanel() {
  const t = useTranslations("enpsTrend");
  const [data, setData] = useState<EnpsTrend | null>(null);

  useEffect(() => {
    apiFetch<EnpsTrend>("/enps-surveys/trend").then(setData);
  }, []);

  if (!data || data.totalResponses === 0) return null;

  const scoreColor = data.enpsScore! >= 50 ? "text-success-700" : data.enpsScore! >= 0 ? "text-amber-600" : "text-error-700";

  return (
    <div className="mt-8">
      <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("title")}</h2>
      <div className="card grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{t("enpsScore")}</div>
          <div className={`mt-1 text-2xl font-semibold ${scoreColor}`}>{data.enpsScore}</div>
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

      {data.comments.length > 0 && (
        <div className="card mt-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{t("recentComments")}</h3>
          <ul className="flex flex-col gap-2">
            {data.comments.slice(0, 5).map((c, i) => (
              <li key={i} className="text-sm">
                <span className="mr-1 rounded-full bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-700">{c.score}</span>
                <span className="text-gray-700">{c.comment}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
