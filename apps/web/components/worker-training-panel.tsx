"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { formatDate } from "@/lib/format-date";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";

interface TrainingEnrollment {
  id: string;
  status: "enrolled" | "completed";
  completedAt: string | null;
  course: { id: string; title: string; validityMonths: number | null };
}

export function WorkerTrainingPanel({ workerId }: { workerId: string }) {
  const t = useTranslations("team");
  const { data: trainingEnrollments = null, reload: reloadTrainingEnrollments, error: trainingEnrollmentsError } = useApi<TrainingEnrollment[]>(`/training/workers/${workerId}/enrollments`);
  const [trainingBusy, setTrainingBusy] = useState(false);

  function load() {
    void reloadTrainingEnrollments();
  }

  async function completeTraining(enrollmentId: string) {
    setTrainingBusy(true);
    try {
      await apiFetch(`/training/enrollments/${enrollmentId}/complete`, { method: "POST", body: JSON.stringify({}) });
      load();
    } finally {
      setTrainingBusy(false);
    }
  }

  if (trainingEnrollments === null) return trainingEnrollmentsError ? <ErrorState error={trainingEnrollmentsError} onRetry={reloadTrainingEnrollments} compact /> : <Skeleton lines={3} />;

  return (
    <>
      <h2 className="mb-3 mt-8 text-sm font-semibold text-fg-muted">{t("trainingHistory")}</h2>
      {trainingEnrollments.length === 0 ? (
        <EmptyState message={t("noTrainingEnrollments")} cta={{ label: t("enrollInTraining"), href: "/settings?tab=templates" }} />
      ) : (
      <ul className="flex flex-col gap-1.5">
        {trainingEnrollments.map((en) => (
          <li key={en.id} className="card flex items-center justify-between gap-2 text-sm">
            <span>{en.course.title}</span>
            {en.status === "completed" ? (
              <span className="rounded-full bg-success-50 dark:bg-success-500/15 px-2 py-0.5 text-xs font-medium text-success-fg">
                {en.completedAt ? formatDate(new Date(en.completedAt)) : t("trainingCompleted")}
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
