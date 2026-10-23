"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useApi } from "@/lib/use-api";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useReloadOnVersion } from "./use-reload-on-version";
import type { SubcontractorCost, SubcontractorSectionProps } from "./types";

/** What the subcontractor has cost, across every project. */
export function CostsSection({ subcontractor: s, version }: SubcontractorSectionProps) {
  const t = useTranslations("subcontractorCompliance");
  const {
    data: costs = null,
    error: costsError,
    reload: reloadCosts,
  } = useApi<SubcontractorCost[]>(`/finance/subcontractor-costs?subcontractorId=${s.id}`);
  useReloadOnVersion(version, reloadCosts);

  return (
    <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t("costsAcrossProjects")}</h3>
      {costs === null ? (
        costsError ? <ErrorState error={costsError} onRetry={reloadCosts} compact /> : <Skeleton lines={3} />
      ) : costs.length === 0 ? (
        <p className="text-xs text-fg-subtle">{t("noCostsYet")}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {costs.map((c) => (
            <li key={c.id} className="flex items-center justify-between text-xs">
              <span>
                <Link href={`/projects/${c.project.id}`} className="text-brand-700 dark:text-brand-400 hover:underline">
                  {c.project.name}
                </Link>
                <span className="text-fg-subtle"> — {c.description}</span>
              </span>
              <span className={c.paid ? "text-success-fg" : "text-fg-subtle"}>{c.amount}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
