"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { formatDate } from "@/lib/format-date";
import { EmptyState } from "@/components/ui/empty-state";

interface TrainingEnrollment {
  id: string;
  status: "enrolled" | "completed";
  completedAt: string | null;
  course: { id: string; title: string; validityMonths: number | null };
}

export function WorkerTrainingPanel({ workerId }: { workerId: string }) {
  const t = useTranslations("team");
  const [trainingEnrollments, setTrainingEnrollments] = useState<TrainingEnrollment[] | null>(null);
  const [trainingBusy, setTrainingBusy] = useState(false);

  function load() {
    apiFetch<TrainingEnrollment[]>(`/training/workers/${workerId}/enrollments`).then(setTrainingEnrollments);
  }

  useEffect(load, [workerId]);

  async function completeTraining(enrollmentId: string) {
    setTrainingBusy(true);
    try {
      await apiFetch(`/training/enrollments/${enrollmentId}/complete`, { method: "POST", body: JSON.stringify({}) });
      load();
    } finally {
      setTrainingBusy(false);
    }
  }

  if (trainingEnrollments === null) return null;

  return (
    <>
      <h2 className="mb-3 mt-8 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("trainingHistory")}</h2>
      {trainingEnrollments.length === 0 ? (
        <EmptyState message={t("noTrainingEnrollments")} cta={{ label: t("enrollInTraining"), href: "/settings?tab=templates" }} />
      ) : (
      <ul className="flex flex-col gap-1.5">
        {trainingEnrollments.map((en) => (
          <li key={en.id} className="card flex items-center justify-between gap-2 text-sm">
            <span>{en.course.title}</span>
            {en.status === "completed" ? (
              <span className="rounded-full bg-success-50 dark:bg-success-500/15 px-2 py-0.5 text-xs font-medium text-success-700 dark:text-success-500">
                {en.completedAt ? formatDate(new Date(en.completedAt)) : t("markComplete")}
              </span>
            ) : (
              <button
                onClick={() => completeTraining(en.id)}
                disabled={trainingBusy}
                className="btn-secondary px-2 py-1 text-xs"
              >
                {t("markComplete")}
              </button>
            )}
          </li>
        ))}
      </ul>
      )}
    </>
  );
}
