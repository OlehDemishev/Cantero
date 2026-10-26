"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { formatDate } from "@/lib/format-date";
import { useApi } from "@/lib/use-api";
import { Field } from "@/components/ui/field";
import { useReloadOnVersion } from "./use-reload-on-version";
import type { PerformanceReview, Scorecard, SubcontractorSectionProps } from "./types";

/** The performance scorecard, past reviews, and a form for a new review. */
export function ScorecardSection({ subcontractor: s, busy, setBusy, version, refresh }: SubcontractorSectionProps) {
  const t = useTranslations("subcontractorCompliance");
  const tc = useTranslations("common");
  const base = `/finance/subcontractors/${s.id}`;
  const { data: scorecard = null, reload: reloadScorecard } = useApi<Scorecard>(`${base}/scorecard`);
  const { data: reviews = null, reload: reloadReviews } = useApi<PerformanceReview[]>(`${base}/performance-reviews`);
  useReloadOnVersion(version, reloadScorecard);
  useReloadOnVersion(version, reloadReviews);
  const [reviewForm, setReviewForm] = useState({ rating: "5", onTime: "", safetyIncidents: "0", reworkCount: "0", wouldHireAgain: "", comments: "" });

  async function addReview(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/finance/subcontractors/${s.id}/performance-reviews`, {
        method: "POST",
        body: JSON.stringify({
          rating: Number(reviewForm.rating),
          onTime: reviewForm.onTime ? reviewForm.onTime === "yes" : undefined,
          safetyIncidents: Number(reviewForm.safetyIncidents) || 0,
          reworkCount: Number(reviewForm.reworkCount) || 0,
          wouldHireAgain: reviewForm.wouldHireAgain ? reviewForm.wouldHireAgain === "yes" : undefined,
          comments: reviewForm.comments || undefined,
        }),
      });
      setReviewForm({ rating: "5", onTime: "", safetyIncidents: "0", reworkCount: "0", wouldHireAgain: "", comments: "" });
      refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t("scorecard")}</h3>
      {scorecard && (
        <div className="mb-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <div>
            <div className="text-fg-subtle">{t("averageRating")}</div>
            <div className="font-semibold">{scorecard.averageRating ?? "—"}</div>
          </div>
          <div>
            <div className="text-fg-subtle">{t("onTimePercent")}</div>
            <div className="font-semibold">{scorecard.onTimePercent !== null ? `${scorecard.onTimePercent}%` : "—"}</div>
          </div>
          <div>
            <div className="text-fg-subtle">{t("wouldHireAgainPercent")}</div>
            <div className="font-semibold">{scorecard.wouldHireAgainPercent !== null ? `${scorecard.wouldHireAgainPercent}%` : "—"}</div>
          </div>
          <div>
            <div className="text-fg-subtle">{t("reviewCount")}</div>
            <div className="font-semibold">{scorecard.reviewCount}</div>
          </div>
        </div>
      )}

      {reviews && reviews.length > 0 && (
        <ul className="mb-3 flex flex-col gap-1.5">
          {reviews.map((r) => (
            <li key={r.id} className="text-xs text-gray-600 dark:text-gray-300">
              <span className="font-medium">{"★".repeat(r.rating)}</span> — {r.reviewedByName},{" "}
              {formatDate(new Date(r.createdAt))}
              {r.comments && <span className="text-fg-subtle"> · {r.comments}</span>}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={addReview} className="flex flex-wrap items-end gap-2">
        <Field label={t("rating")} size="sm">
          <select
            className="input w-auto"
            value={reviewForm.rating}
            onChange={(e) => setReviewForm((f) => ({ ...f, rating: e.target.value }))}
          >
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("onTime")} size="sm">
          <select className="input w-auto" value={reviewForm.onTime} onChange={(e) => setReviewForm((f) => ({ ...f, onTime: e.target.value }))}>
            <option value="">—</option>
            <option value="yes">{tc("yes")}</option>
            <option value="no">{tc("no")}</option>
          </select>
        </Field>
        <Field label={t("wouldHireAgain")} size="sm">
          <select
            className="input w-auto"
            value={reviewForm.wouldHireAgain}
            onChange={(e) => setReviewForm((f) => ({ ...f, wouldHireAgain: e.target.value }))}
          >
            <option value="">—</option>
            <option value="yes">{tc("yes")}</option>
            <option value="no">{tc("no")}</option>
          </select>
        </Field>
        <Field label={t("safetyIncidents")} size="sm">
          <input
            type="number"
            min="0"
            className="input w-20"
            value={reviewForm.safetyIncidents}
            onChange={(e) => setReviewForm((f) => ({ ...f, safetyIncidents: e.target.value }))}
          />
        </Field>
        <Field label={t("reworkCount")} size="sm">
          <input
            type="number"
            min="0"
            className="input w-20"
            value={reviewForm.reworkCount}
            onChange={(e) => setReviewForm((f) => ({ ...f, reworkCount: e.target.value }))}
          />
        </Field>
        <input
          placeholder={t("reviewCommentsPlaceholder")} aria-label={t("reviewCommentsPlaceholder")}
          className="input"
          value={reviewForm.comments}
          onChange={(e) => setReviewForm((f) => ({ ...f, comments: e.target.value }))}
        />
        <button type="submit" disabled={busy} className="btn-secondary px-2.5 py-1 text-xs">
          {t("addReview")}
        </button>
      </form>
    </div>
  );
}
