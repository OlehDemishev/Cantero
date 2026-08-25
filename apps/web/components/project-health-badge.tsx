"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";

type Band = "good" | "watch" | "at_risk";
interface Health {
  score: number;
  band: Band;
  factors: { label: string; penalty: number }[];
}

const bandClass: Record<Band, string> = {
  good: "bg-success-50 text-success-700",
  watch: "bg-amber-50 text-amber-700",
  at_risk: "bg-error-50 text-error-700",
};

export function ProjectHealthBadge({ projectId }: { projectId: string }) {
  const t = useTranslations("projects");
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    apiFetch<Health>(`/insights/projects/${projectId}/health`).then(setHealth);
  }, [projectId]);

  if (!health) return null;

  return (
    <span className="group relative inline-flex items-center">
      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${bandClass[health.band]}`}>
        {t(`health_${health.band}`)} · {health.score}
      </span>
      {health.factors.length > 0 && (
        <span className="pointer-events-none absolute left-0 top-full z-10 mt-1 hidden w-56 rounded border border-gray-200 bg-white p-2 text-xs text-gray-600 shadow-lg group-hover:block">
          {health.factors.map((f) => (
            <div key={f.label}>{f.label}</div>
          ))}
        </span>
      )}
    </span>
  );
}
