"use client";

import { useTranslations } from "next-intl";
import { useApi } from "@/lib/use-api";
import { Badge } from "@/components/ui/badge";
import { statusTone } from "@/lib/status-tone";

type Band = "good" | "watch" | "at_risk";
interface Health {
  score: number;
  band: Band;
  /** `key` + `params` are translated (messages: projectHealth.factor_<key>); `label` is the API's English. */
  factors: { key?: string; params?: Record<string, number>; label: string; penalty: number }[];
}

export function ProjectHealthBadge({ projectId }: { projectId: string }) {
  const t = useTranslations("projects");
  const th = useTranslations("projectHealth");
  const { data: health = null } = useApi<Health>(`/insights/projects/${projectId}/health`);

  if (!health) return null;

  return (
    <span className="group relative inline-flex items-center">
      <Badge tone={statusTone(health.band)}>
        {t(`health_${health.band}`)} · {health.score}
      </Badge>
      {health.factors.length > 0 && (
        <span className="pointer-events-none absolute left-0 top-full z-10 mt-1 hidden w-56 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-2 text-xs text-gray-600 dark:text-gray-300 shadow-lg group-hover:block">
          {health.factors.map((f) => (
            <div key={f.label}>{f.key && th.has(`factor_${f.key}`) ? th(`factor_${f.key}`, f.params ?? {}) : f.label}</div>
          ))}
        </span>
      )}
    </span>
  );
}
