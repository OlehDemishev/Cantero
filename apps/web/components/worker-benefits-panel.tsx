"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { EmptyState } from "@/components/ui/empty-state";

interface BenefitEnrollment {
  id: string;
  status: "active" | "waived" | "terminated";
  effectiveDate: string;
  plan: { id: string; name: string };
  tier: { id: string; name: string };
}

export function WorkerBenefitsPanel({ workerId }: { workerId: string }) {
  const t = useTranslations("team");
  const tb = useTranslations("benefits");
  const [benefitEnrollments, setBenefitEnrollments] = useState<BenefitEnrollment[] | null>(null);
  const [benefitsBusy, setBenefitsBusy] = useState(false);

  function load() {
    apiFetch<BenefitEnrollment[]>(`/workers/${workerId}/benefit-enrollments`).then(setBenefitEnrollments);
  }

  useEffect(load, [workerId]);

  async function updateEnrollmentStatus(enrollmentId: string, status: "waived" | "terminated") {
    if (status === "terminated" && !window.confirm(t("confirmTerminateEnrollment"))) return;
    setBenefitsBusy(true);
    try {
      await apiFetch(`/benefits/enrollments/${enrollmentId}/status`, { method: "POST", body: JSON.stringify({ status }) });
      load();
    } finally {
      setBenefitsBusy(false);
    }
  }

  if (benefitEnrollments === null) return null;

  return (
    <>
      <h2 className="mb-3 mt-8 text-sm font-semibold text-gray-700 dark:text-gray-200">{tb("title")}</h2>
      {benefitEnrollments.length === 0 ? (
        <EmptyState message={t("noBenefitEnrollments")} cta={{ label: t("enrollInBenefits"), href: "/benefits" }} />
      ) : (
      <ul className="flex flex-col gap-1.5">
        {benefitEnrollments.map((en) => (
          <li key={en.id} className="card text-sm">
            <div className="flex items-center justify-between">
              <span>
                {en.plan.name} <span className="text-xs text-gray-400 dark:text-gray-500">({en.tier.name})</span>
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  en.status === "active" ? "bg-success-50 dark:bg-success-500/15 text-success-700 dark:text-success-500" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                }`}
              >
                {tb(`enrollmentStatus_${en.status}`)}
              </span>
            </div>
            {en.status === "active" && (
              <div className="mt-1.5 flex gap-2">
                <button onClick={() => updateEnrollmentStatus(en.id, "waived")} disabled={benefitsBusy} className="text-xs text-gray-500 dark:text-gray-400 hover:underline">
                  {tb("waive")}
                </button>
                <button onClick={() => updateEnrollmentStatus(en.id, "terminated")} disabled={benefitsBusy} className="text-xs text-error-700 dark:text-error-500 hover:underline">
                  {tb("terminate")}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      )}
    </>
  );
}
