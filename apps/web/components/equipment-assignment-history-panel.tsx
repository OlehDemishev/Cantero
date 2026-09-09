"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format-date";

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
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);

  useEffect(() => {
    apiFetch<Assignment[]>(`/equipment/${equipmentId}/assignments`).then(setAssignments);
  }, [equipmentId]);

  return (
    <section className="card lg:col-span-2">
      <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("assignmentHistory")}</h2>
      {!assignments || assignments.length === 0 ? (
        <p className="text-sm text-gray-400">{t("noAssignments")}</p>
      ) : (
        <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-2">{tc("name")}</th>
              <th>{t("checkedOutAt")}</th>
              <th>{t("checkedInAt")}</th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((a) => (
              <tr key={a.id} className="border-b border-gray-100">
                <td className="py-2">
                  {a.worker ? (
                    <Link href={`/team/${a.worker.id}`} className="text-brand-700 hover:underline">
                      {a.worker.name}
                    </Link>
                  ) : a.project ? (
                    <Link href={`/projects/${a.project.id}`} className="text-brand-700 hover:underline">
                      {a.project.name}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  {formatDateTime(new Date(a.checkedOutAt))}
                  {a.checkOutWithinGeofence === false && (
                    <span className="ml-1 rounded-full bg-warning-50 px-1.5 py-0.5 text-[10px] font-medium text-warning-700">
                      {t("offSite")}
                    </span>
                  )}
                </td>
                <td>
                  {a.checkedInAt ? formatDateTime(new Date(a.checkedInAt)) : t("stillOut")}
                  {a.checkInWithinGeofence === false && (
                    <span className="ml-1 rounded-full bg-warning-50 px-1.5 py-0.5 text-[10px] font-medium text-warning-700">
                      {t("offSite")}
                    </span>
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
