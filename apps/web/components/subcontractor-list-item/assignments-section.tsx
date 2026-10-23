"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { formatDate } from "@/lib/format-date";
import { useApi } from "@/lib/use-api";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useReloadOnVersion } from "./use-reload-on-version";
import type { Assignment, SubcontractorSectionProps } from "./types";

/** The projects the subcontractor is assigned to. */
export function AssignmentsSection({ subcontractor: s, version }: SubcontractorSectionProps) {
  const t = useTranslations("subcontractorCompliance");
  const {
    data: assignments = null,
    error: assignmentsError,
    reload: reloadAssignments,
  } = useApi<Assignment[]>(`/finance/subcontractors/${s.id}/assignments`);
  useReloadOnVersion(version, reloadAssignments);

  return (
    <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t("projects")}</h3>
      {assignments === null ? (
        assignmentsError ? <ErrorState error={assignmentsError} onRetry={reloadAssignments} compact /> : <Skeleton lines={3} />
      ) : assignments.length === 0 ? (
        <p className="text-xs text-fg-subtle">{t("noAssignedProjects")}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {assignments.map((a) => (
            <li key={a.id} className="text-xs">
              <Link href={`/projects/${a.project.id}`} className="text-brand-700 dark:text-brand-400 hover:underline">
                {a.project.name}
              </Link>
              {a.startDate && (
                <span className="text-fg-subtle">
                  {" "}
                  · {formatDate(new Date(a.startDate))}
                  {a.endDate && ` – ${formatDate(new Date(a.endDate))}`}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
