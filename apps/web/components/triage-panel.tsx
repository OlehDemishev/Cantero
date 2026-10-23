"use client";

import { useTranslations } from "next-intl";
import { useApi } from "@/lib/use-api";
import { useCan } from "@/lib/permissions";
import { PanelErrorState } from "@/components/ui/error-state";

interface TriageItem {
  kind: "rfi" | "punch_list_item";
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  score: number;
  link: string;
}

export function TriagePanel() {
  const t = useTranslations("dashboard");
  const canSee = useCan()("site.manage");
  const { data: items = null, error, reload } = useApi<TriageItem[]>(canSee ? "/insights/triage" : null);

  if (!canSee) return null;
  if (error && !items) return <PanelErrorState title={t("triageTitle")} error={error} onRetry={reload} className="mt-8" />;
  if (!items || items.length === 0) return null;

  return (
    <div className="mt-8">
      <h2 className="mb-3 text-sm font-semibold text-fg-muted">{t("triageTitle")}</h2>
      <ul className="flex flex-col gap-2">
        {items.slice(0, 8).map((item) => (
          <li key={`${item.kind}-${item.id}`}>
            <a href={item.link} className="card flex items-center justify-between hover:border-gray-400">
              <div>
                <span className="font-medium">{item.title}</span>
                <span className="ml-2 text-sm text-fg-subtle">{item.projectName}</span>
              </div>
              <span className="rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs text-gray-600 dark:text-gray-300">{item.score}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
