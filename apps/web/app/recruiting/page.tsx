"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { CANDIDATE_STAGES, type CandidateStage, type JobPostingStatus } from "@cantero/shared";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { apiFetch } from "@/lib/api-client";

interface JobPosting {
  id: string;
  title: string;
  trade: string | null;
  location: string | null;
  status: JobPostingStatus;
  _count: { candidates: number };
}
interface Candidate {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  stage: CandidateStage;
  hiredWorkerId: string | null;
}
interface Interview {
  id: string;
  scheduledAt: string | null;
  interviewerName: string | null;
  notes: string | null;
  rating: number | null;
}
interface CandidateDetail extends Candidate {
  interviews: Interview[];
}

const STAGE_STYLES: Record<CandidateStage, string> = {
  applied: "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300",
  screening: "bg-warning-50 dark:bg-warning-500/15 text-warning-700 dark:text-warning-500",
  interviewing: "bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-400",
  offer: "bg-amber-50 text-amber-700",
  hired: "bg-success-50 dark:bg-success-500/15 text-success-700 dark:text-success-500",
  rejected: "bg-error-50 dark:bg-error-500/15 text-error-700 dark:text-error-500",
};

export default function RecruitingPage() {
  const t = useTranslations("recruiting");
  const tc = useTranslations("common");

  const [postings, setPostings] = useState<JobPosting[] | null>(null);
  const [postingForm, setPostingForm] = useState({ title: "", trade: "", location: "" });
  const [selectedPostingId, setSelectedPostingId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [candidateForm, setCandidateForm] = useState({ name: "", email: "", phone: "", source: "" });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CandidateDetail | null>(null);
  const [interviewForm, setInterviewForm] = useState({ interviewerName: "", notes: "", rating: "" });
  const [convertForm, setConvertForm] = useState({ role: "", hourlyCost: "" });
  const [busy, setBusy] = useState(false);

  function loadPostings() {
    apiFetch<JobPosting[]>("/recruiting/job-postings").then((list) => {
      setPostings(list);
      if (!selectedPostingId && list[0]) setSelectedPostingId(list[0].id);
    });
  }
  useEffect(loadPostings, []);

  function loadCandidates() {
    if (!selectedPostingId) return;
    apiFetch<Candidate[]>(`/recruiting/job-postings/${selectedPostingId}/candidates`).then(setCandidates);
  }
  useEffect(loadCandidates, [selectedPostingId]);

  async function createPosting(e: React.FormEvent) {
    e.preventDefault();
    if (!postingForm.title.trim()) return;
    setBusy(true);
    try {
      const created = await apiFetch<JobPosting>("/recruiting/job-postings", {
        method: "POST",
        body: JSON.stringify({
          title: postingForm.title.trim(),
          trade: postingForm.trade || undefined,
          location: postingForm.location || undefined,
        }),
      });
      setPostingForm({ title: "", trade: "", location: "" });
      setSelectedPostingId(created.id);
      loadPostings();
    } finally {
      setBusy(false);
    }
  }

  async function closePosting(id: string) {
    await apiFetch(`/recruiting/job-postings/${id}`, { method: "PATCH", body: JSON.stringify({ status: "closed" }) });
    loadPostings();
  }

  async function createCandidate(e: React.FormEvent) {
    e.preventDefault();
    if (!candidateForm.name.trim() || !selectedPostingId) return;
    setBusy(true);
    try {
      await apiFetch(`/recruiting/job-postings/${selectedPostingId}/candidates`, {
        method: "POST",
        body: JSON.stringify({
          name: candidateForm.name.trim(),
          email: candidateForm.email || undefined,
          phone: candidateForm.phone || undefined,
          source: candidateForm.source || undefined,
        }),
      });
      setCandidateForm({ name: "", email: "", phone: "", source: "" });
      loadCandidates();
      loadPostings();
    } finally {
      setBusy(false);
    }
  }

  async function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(id);
    const d = await apiFetch<CandidateDetail>(`/recruiting/candidates/${id}`);
    setDetail(d);
  }

  async function moveStage(id: string, stage: CandidateStage) {
    setBusy(true);
    try {
      await apiFetch(`/recruiting/candidates/${id}/stage`, { method: "POST", body: JSON.stringify({ stage }) });
      loadCandidates();
      const d = await apiFetch<CandidateDetail>(`/recruiting/candidates/${id}`);
      setDetail(d);
    } finally {
      setBusy(false);
    }
  }

  async function addInterview(id: string) {
    setBusy(true);
    try {
      await apiFetch(`/recruiting/candidates/${id}/interviews`, {
        method: "POST",
        body: JSON.stringify({
          interviewerName: interviewForm.interviewerName || undefined,
          notes: interviewForm.notes || undefined,
          rating: interviewForm.rating ? Number(interviewForm.rating) : undefined,
        }),
      });
      setInterviewForm({ interviewerName: "", notes: "", rating: "" });
      const d = await apiFetch<CandidateDetail>(`/recruiting/candidates/${id}`);
      setDetail(d);
    } finally {
      setBusy(false);
    }
  }

  async function convertToWorker(id: string) {
    setBusy(true);
    try {
      await apiFetch(`/recruiting/candidates/${id}/convert-to-worker`, {
        method: "POST",
        body: JSON.stringify({
          role: convertForm.role || undefined,
          hourlyCost: convertForm.hourlyCost ? Number(convertForm.hourlyCost) : undefined,
        }),
      });
      loadCandidates();
      const d = await apiFetch<CandidateDetail>(`/recruiting/candidates/${id}`);
      setDetail(d);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthenticatedShell>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("jobPostings")}</h2>
          {!postings ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">{tc("loading")}</p>
          ) : (
            <ul className="mb-4 flex flex-col gap-1.5">
              {postings.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => setSelectedPostingId(p.id)}
                    className={`card flex w-full items-center justify-between text-left text-sm ${selectedPostingId === p.id ? "ring-2 ring-brand-500" : ""}`}
                  >
                    <span>
                      {p.title}
                      {p.trade && <span className="text-gray-400 dark:text-gray-500"> · {p.trade}</span>}
                      <span className="ml-1 text-xs text-gray-400 dark:text-gray-500">({p._count.candidates})</span>
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${p.status === "open" ? "bg-success-50 dark:bg-success-500/15 text-success-700 dark:text-success-500" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"}`}
                    >
                      {t(`postingStatus_${p.status}`)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={createPosting} className="card flex flex-col gap-2">
            <input
              required
              placeholder={t("postingTitlePlaceholder")}
              className="input"
              value={postingForm.title}
              onChange={(e) => setPostingForm((f) => ({ ...f, title: e.target.value }))}
            />
            <input
              placeholder={t("tradePlaceholder")}
              className="input"
              value={postingForm.trade}
              onChange={(e) => setPostingForm((f) => ({ ...f, trade: e.target.value }))}
            />
            <input
              placeholder={t("locationPlaceholder")}
              className="input"
              value={postingForm.location}
              onChange={(e) => setPostingForm((f) => ({ ...f, location: e.target.value }))}
            />
            <button type="submit" disabled={busy} className="btn-primary">
              {t("addPosting")}
            </button>
            {selectedPostingId && postings?.find((p) => p.id === selectedPostingId)?.status === "open" && (
              <button type="button" onClick={() => closePosting(selectedPostingId)} className="btn-secondary">
                {t("closePosting")}
              </button>
            )}
          </form>
        </div>

        <div className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("candidates")}</h2>
          {!selectedPostingId ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">{t("selectPosting")}</p>
          ) : (
            <>
              <form onSubmit={createCandidate} className="card mb-4 flex flex-wrap items-end gap-2">
                <input
                  required
                  placeholder={t("candidateNamePlaceholder")}
                  className="input"
                  value={candidateForm.name}
                  onChange={(e) => setCandidateForm((f) => ({ ...f, name: e.target.value }))}
                />
                <input
                  placeholder={t("emailPlaceholder")}
                  className="input"
                  value={candidateForm.email}
                  onChange={(e) => setCandidateForm((f) => ({ ...f, email: e.target.value }))}
                />
                <input
                  placeholder={t("phonePlaceholder")}
                  className="input"
                  value={candidateForm.phone}
                  onChange={(e) => setCandidateForm((f) => ({ ...f, phone: e.target.value }))}
                />
                <input
                  placeholder={t("sourcePlaceholder")}
                  className="input"
                  value={candidateForm.source}
                  onChange={(e) => setCandidateForm((f) => ({ ...f, source: e.target.value }))}
                />
                <button type="submit" disabled={busy} className="btn-secondary shrink-0">
                  {t("addCandidate")}
                </button>
              </form>

              {!candidates ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">{tc("loading")}</p>
              ) : candidates.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500">{t("noCandidates")}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {candidates.map((c) => {
                    const expanded = expandedId === c.id;
                    return (
                      <li key={c.id} className="card">
                        <button onClick={() => toggleExpand(c.id)} className="flex w-full items-center justify-between text-left">
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-50">
                            {c.name}
                            {c.source && <span className="ml-1 text-xs text-gray-400 dark:text-gray-500">({c.source})</span>}
                          </span>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STAGE_STYLES[c.stage]}`}>{t(`stage_${c.stage}`)}</span>
                        </button>

                        {expanded && detail && detail.id === c.id && (
                          <div className="mt-3 flex flex-col gap-3 border-t border-gray-100 dark:border-gray-700 pt-3">
                            {c.stage !== "hired" && c.stage !== "rejected" && (
                              <div className="flex flex-wrap gap-1.5">
                                {CANDIDATE_STAGES.filter((s) => s !== c.stage && s !== "hired").map((s) => (
                                  <button key={s} onClick={() => moveStage(c.id, s)} disabled={busy} className="btn-secondary px-2 py-1 text-xs">
                                    {t(`moveTo_${s}`)}
                                  </button>
                                ))}
                              </div>
                            )}

                            <div>
                              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t("interviews")}</h3>
                              {detail.interviews.length === 0 ? (
                                <p className="mb-2 text-xs text-gray-400 dark:text-gray-500">{t("noInterviews")}</p>
                              ) : (
                                <ul className="mb-2 flex flex-col gap-1">
                                  {detail.interviews.map((iv) => (
                                    <li key={iv.id} className="text-xs">
                                      {iv.interviewerName ?? "—"}
                                      {iv.rating && ` · ${iv.rating}/5`}
                                      {iv.notes && <span className="text-gray-400 dark:text-gray-500"> — {iv.notes}</span>}
                                    </li>
                                  ))}
                                </ul>
                              )}
                              {c.stage !== "hired" && c.stage !== "rejected" && (
                                <div className="flex flex-wrap gap-2">
                                  <input
                                    placeholder={t("interviewerPlaceholder")}
                                    className="input w-auto"
                                    value={interviewForm.interviewerName}
                                    onChange={(e) => setInterviewForm((f) => ({ ...f, interviewerName: e.target.value }))}
                                  />
                                  <input
                                    type="number"
                                    min="1"
                                    max="5"
                                    placeholder={t("ratingPlaceholder")}
                                    className="input w-20"
                                    value={interviewForm.rating}
                                    onChange={(e) => setInterviewForm((f) => ({ ...f, rating: e.target.value }))}
                                  />
                                  <input
                                    placeholder={t("interviewNotesPlaceholder")}
                                    className="input flex-1"
                                    value={interviewForm.notes}
                                    onChange={(e) => setInterviewForm((f) => ({ ...f, notes: e.target.value }))}
                                  />
                                  <button onClick={() => addInterview(c.id)} disabled={busy} className="btn-secondary shrink-0 px-2.5 py-1 text-xs">
                                    {t("logInterview")}
                                  </button>
                                </div>
                              )}
                            </div>

                            {c.hiredWorkerId ? (
                              <p className="text-sm text-success-700 dark:text-success-500">
                                {t("alreadyHired")}{" "}
                                <Link href={`/team/${c.hiredWorkerId}`} className="font-medium underline">
                                  {t("viewWorkerProfile")}
                                </Link>
                              </p>
                            ) : (
                              c.stage !== "rejected" && (
                                <div className="flex flex-wrap items-end gap-2 border-t border-gray-100 dark:border-gray-700 pt-3">
                                  <input
                                    placeholder={t("rolePlaceholder")}
                                    className="input w-auto"
                                    value={convertForm.role}
                                    onChange={(e) => setConvertForm((f) => ({ ...f, role: e.target.value }))}
                                  />
                                  <input
                                    type="number"
                                    step="0.01"
                                    placeholder={t("hourlyCostPlaceholder")}
                                    className="input w-32"
                                    value={convertForm.hourlyCost}
                                    onChange={(e) => setConvertForm((f) => ({ ...f, hourlyCost: e.target.value }))}
                                  />
                                  <button onClick={() => convertToWorker(c.id)} disabled={busy} className="btn-primary px-3 py-1.5 text-xs">
                                    {t("convertToWorker")}
                                  </button>
                                </div>
                              )
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </AuthenticatedShell>
  );
}
