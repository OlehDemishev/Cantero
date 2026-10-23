"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useApi } from "@/lib/use-api";
import { formatDateTime } from "@/lib/format-date";
import { Badge } from "@/components/ui/badge";

interface Assignment {
  id: string;
  checkedOutAt: string;
  checkedInAt: string | null;
  notes: string | null;
  project: { id: string; name: string } | null;
  worker: { id: string; name: string } | null;
  checkOutWithinGeofence: boolean | null;
  checkInWithinGeofence: boolean | null;
}

export function EquipmentAssignmentHistoryPanel({ equipmentId }: { equipmentId: string }) {
  const t = useTranslations("equipment");
  const tc = useTranslations("common");
  const { data: assignments = null } = useApi<Assignment[]>(`/equipment/${equipmentId}/assignments`);

  return (
    <section className="card lg:col-span-2">
      <h2 className="mb-3 text-sm font-semibold text-fg-muted">{t("assignmentHistory")}</h2>
      {!assignments || assignments.length === 0 ? (
        <p className="text-sm text-fg-subtle">{t("noAssignments")}</p>
      ) : (
        <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-fg-subtle">
              <th className="py-2">{tc("name")}</th>
              <th>{t("checkedOutAt")}</th>
              <th>{t("checkedInAt")}</th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((a) => (
              <tr key={a.id} className="border-b border-gray-100 dark:border-gray-700">
                <td className="py-2">
                  {a.worker ? (
                    <Link href={`/team/${a.worker.id}`} className="text-brand-700 dark:text-brand-400 hover:underline">
                      {a.worker.name}
                    </Link>
                  ) : a.project ? (
                    <Link href={`/projects/${a.project.id}`} className="text-brand-700 dark:text-brand-400 hover:underline">
                      {a.project.name}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  {formatDateTime(new Date(a.checkedOutAt))}
                  {a.checkOutWithinGeofence === false && (
                    <Badge tone="warning" size="sm" className="ml-1">
                      {t("offSite")}
                    </Badge>
                  )}
                </td>
                <td>
                  {a.checkedInAt ? formatDateTime(new Date(a.checkedInAt)) : t("stillOut")}
                  {a.checkInWithinGeofence === false && (
                    <Badge tone="warning" size="sm" className="ml-1">
                      {t("offSite")}
                    </Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </section>
  );
}
