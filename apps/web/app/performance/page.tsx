"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { PERFORMANCE_RATINGS, type PerformanceRating, type PerformanceReviewCycleStatus } from "@cantero/shared";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { CloseIcon } from "@/components/nav-icons";
import { apiFetch } from "@/lib/api-client";
import { formatDate } from "@/lib/format-date";

interface Cycle {
  id: string;
  name: string;
  periodStart: string;
  periodEnd: string;
  status: PerformanceReviewCycleStatus;
}
interface Worker {
  id: string;
  name: string;
}
interface Review {
  id: string;
  workerId: string;
  reviewerName: string;
  rating: PerformanceRating | null;
  strengths: string | null;
  improvementAreas: string | null;
  submittedAt: string | null;
  worker: { id: string; name: string };
}

const RATING_STYLES: Record<PerformanceRating, string> = {
  below_expectations: "bg-error-50 dark:bg-error-500/15 text-error-700 dark:text-error-500",
  meets_expectations: "bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-400",
  exceeds_expectations: "bg-success-50 dark:bg-success-500/15 text-success-700 dark:text-success-500",
};

export default function PerformancePage() {
  const t = useTranslations("performance");
  const tc = useTranslations("common");

  const [cycles, setCycles] = useState<Cycle[] | null>(null);
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [cycleForm, setCycleForm] = useState({ name: "", periodStart: "", periodEnd: "" });
  const [reviewWorkerId, setReviewWorkerId] = useState("");
  const [reviewForm, setReviewForm] = useState({ rating: "" as PerformanceRating | "", strengths: "", improvementAreas: "" });
  const [busy, setBusy] = useState(false);
  const [showCycleForm, setShowCycleForm] = useState(false);

  function loadCycles() {
    apiFetch<Cycle[]>("/performance/cycles").then((list) => {
      setCycles(list);
      if (!selectedCycleId && list[0]) setSelectedCycleId(list[0].id);
    });
  }
  useEffect(loadCycles, []);
  useEffect(() => {
    apiFetch<Worker[]>("/workers").then((list) => {
      setWorkers(list);
      if (list[0]) setReviewWorkerId(list[0].id);
    });
  }, []);

  function loadReviews() {
    if (!selectedCycleId) return;
    apiFetch<Review[]>(`/performance/cycles/${selectedCycleId}/reviews`).then(setReviews);
  }
  useEffect(loadReviews, [selectedCycleId]);

  async function createCycle(e: React.FormEvent) {
    e.preventDefault();
    if (!cycleForm.name.trim() || !cycleForm.periodStart || !cycleForm.periodEnd) return;
    setBusy(true);
    try {
      const created = await apiFetch<Cycle>("/performance/cycles", {
        method: "POST",
        body: JSON.stringify({
          name: cycleForm.name.trim(),
          periodStart: new Date(cycleForm.periodStart).toISOString(),
          periodEnd: new Date(cycleForm.periodEnd).toISOString(),
        }),
      });
      setCycleForm({ name: "", periodStart: "", periodEnd: "" });
      setSelectedCycleId(created.id);
      setShowCycleForm(false);
      loadCycles();
    } finally {
      setBusy(false);
    }
  }

  async function closeCycle(id: string) {
    await apiFetch(`/performance/cycles/${id}/close`, { method: "POST" });
    loadCycles();
  }

  async function submitReview(submit: boolean) {
    if (!selectedCycleId || !reviewWorkerId) return;
    setBusy(true);
    try {
      await apiFetch(`/performance/cycles/${selectedCycleId}/reviews`, {
        method: "POST",
        body: JSON.stringify({
          workerId: reviewWorkerId,
          rating: reviewForm.rating || undefined,
          strengths: reviewForm.strengths || undefined,
          improvementAreas: reviewForm.improvementAreas || undefined,
          submit,
        }),
      });
      setReviewForm({ rating: "", strengths: "", improvementAreas: "" });
      loadReviews();
    } finally {
      setBusy(false);
    }
  }

  const selectedCycle = cycles?.find((c) => c.id === selectedCycleId);

  return (
    <AuthenticatedShell>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t("cycles")}</h2>
            {!showCycleForm && (
              <button type="button" onClick={() => setShowCycleForm(true)} className="text-sm font-medium text-brand-700 dark:text-brand-400 hover:underline">
                {t("launchCycle")}
              </button>
            )}
          </div>
          {!cycles ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">{tc("loading")}</p>
          ) : (
            <ul className="mb-4 flex flex-col gap-1.5">
              {cycles.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => setSelectedCycleId(c.id)}
                    className={`card flex w-full items-center justify-between text-left text-sm ${selectedCycleId === c.id ? "ring-2 ring-brand-500" : ""}`}
                  >
                    <span>{c.name}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${c.status === "open" ? "bg-success-50 dark:bg-success-500/15 text-success-700 dark:text-success-500" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"}`}
                    >
                      {t(`cycleStatus_${c.status}`)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {showCycleForm && (
            <form onSubmit={createCycle} className="card flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{t("launchCycle")}</span>
                <button
                  type="button"
                  onClick={() => setShowCycleForm(false)}
                  aria-label={tc("cancel")}
                  className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                >
                  <CloseIcon className="size-4" />
                </button>
              </div>
              <input
                required
                autoFocus
                placeholder={t("cycleNamePlaceholder")}
                className="input"
                value={cycleForm.name}
                onChange={(e) => setCycleForm((f) => ({ ...f, name: e.target.value }))}
              />
              <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
                {t("periodStart")}
                <input
                  required
                  type="date"
                  className="input"
                  value={cycleForm.periodStart}
                  onChange={(e) => setCycleForm((f) => ({ ...f, periodStart: e.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
                {t("periodEnd")}
                <input
                  required
                  type="date"
                  className="input"
                  value={cycleForm.periodEnd}
                  onChange={(e) => setCycleForm((f) => ({ ...f, periodEnd: e.target.value }))}
                />
              </label>
              <button type="submit" disabled={busy} className="btn-primary">
                {t("launchCycle")}
              </button>
            </form>
          )}
          {selectedCycle?.status === "open" && (
            <button type="button" onClick={() => closeCycle(selectedCycle.id)} className="btn-secondary mt-2 w-full">
              {t("closeCycle")}
            </button>
          )}
        </div>

        <div className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("reviews")}</h2>
          {!selectedCycleId ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">{t("selectCycle")}</p>
          ) : (
            <>
              {selectedCycle?.status === "open" && (
                <div className="card mb-4 flex flex-col gap-2">
                  <div className="flex flex-wrap gap-2">
                    <select className="input" value={reviewWorkerId} onChange={(e) => setReviewWorkerId(e.target.value)}>
                      {workers.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                    <select
                      className="input"
                      value={reviewForm.rating}
                      onChange={(e) => setReviewForm((f) => ({ ...f, rating: e.target.value as PerformanceRating }))}
                    >
                      <option value="">{t("noRatingYet")}</option>
                      {PERFORMANCE_RATINGS.map((r) => (
                        <option key={r} value={r}>
                          {t(`rating_${r}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <textarea
                    placeholder={t("strengthsPlaceholder")}
                    className="input"
                    rows={2}
                    value={reviewForm.strengths}
                    onChange={(e) => setReviewForm((f) => ({ ...f, strengths: e.target.value }))}
                  />
                  <textarea
                    placeholder={t("improvementAreasPlaceholder")}
                    className="input"
                    rows={2}
                    value={reviewForm.improvementAreas}
                    onChange={(e) => setReviewForm((f) => ({ ...f, improvementAreas: e.target.value }))}
                  />
                  <div className="flex gap-2">
                    <button onClick={() => submitReview(false)} disabled={busy} className="btn-secondary">
                      {t("saveDraft")}
                    </button>
                    <button onClick={() => submitReview(true)} disabled={busy} className="btn-primary">
                      {t("submitReview")}
                    </button>
                  </div>
                </div>
              )}

              {!reviews ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">{tc("loading")}</p>
              ) : reviews.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500">{t("noReviews")}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {reviews.map((r) => (
                    <li key={r.id} className="card">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-50">{r.worker.name}</span>
                        {r.rating && <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${RATING_STYLES[r.rating]}`}>{t(`rating_${r.rating}`)}</span>}
                      </div>
                      {r.strengths && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t("strengths")}: {r.strengths}</p>}
                      {r.improvementAreas && <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{t("improvementAreas")}: {r.improvementAreas}</p>}
                      <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                        {r.submittedAt ? t("submittedOn", { date: formatDate(new Date(r.submittedAt)) }) : t("draft")}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </AuthenticatedShell>
  );
}
