"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { SUBMITTAL_REVIEW_DECISIONS, type SubmittalReviewDecision, type SubmittalStatus } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";

interface SubmittalHistoryEntry {
  id: string;
  revision: number;
  status: SubmittalStatus;
  reviewComments: string | null;
}
interface Submittal {
  id: string;
  number: string;
  revision: number;
  title: string;
  specSection: string | null;
  status: SubmittalStatus;
  dueDate: string | null;
  submittedByName: string | null;
  reviewedByName: string | null;
  reviewComments: string | null;
}

const STATUS_STYLES: Record<SubmittalStatus, string> = {
  draft: "bg-gray-100 text-gray-600",
  submitted: "bg-brand-50 text-brand-700",
  approved: "bg-success-50 text-success-700",
  approved_as_noted: "bg-success-50 text-success-700",
  revise_and_resubmit: "bg-warning-50 text-warning-700",
  rejected: "bg-error-50 text-error-700",
};

const EMPTY_FORM = { title: "", specSection: "", dueDate: "" };

export function SubmittalsPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("submittals");
  const tc = useTranslations("common");

  const [items, setItems] = useState<Submittal[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [historyById, setHistoryById] = useState<Record<string, SubmittalHistoryEntry[]>>({});
  const [reviewDecision, setReviewDecision] = useState<SubmittalReviewDecision>("approved");
  const [reviewComments, setReviewComments] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<Submittal[]>(`/submittals?projectId=${projectId}`).then(setItems);
  }

  useEffect(load, [projectId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch("/submittals", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          title: form.title,
          specSection: form.specSection || undefined,
          dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : undefined,
        }),
      });
      setForm(EMPTY_FORM);
      setCreating(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function doSubmitForReview(id: string) {
    await apiFetch(`/submittals/${id}/submit`, { method: "POST" });
    load();
  }

  async function doReview(id: string) {
    setBusy(true);
    try {
      await apiFetch(`/submittals/${id}/review`, {
        method: "POST",
        body: JSON.stringify({ decision: reviewDecision, comments: reviewComments || undefined }),
      });
      setReviewComments("");
      load();
    } finally {
      setBusy(false);
    }
  }

  async function doRevise(id: string) {
    await apiFetch(`/submittals/${id}/revise`, { method: "POST" });
    load();
  }

  return (
    <div className="mt-10">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">{t("title")}</h2>
        {!creating && (
          <button onClick={() => setCreating(true)} className="btn-secondary px-3 py-1 text-xs">
            {t("newSubmittal")}
          </button>
        )}
      </div>

      {creating && (
        <form onSubmit={submit} className="card mb-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700">{t("submittalTitle")}</span>
            <input
              required
              className="input"
              placeholder={t("submittalTitlePlaceholder")}
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </label>
          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700">{t("specSection")}</span>
              <input
                className="input"
                placeholder="09 30 00"
                value={form.specSection}
                onChange={(e) => setForm((f) => ({ ...f, specSection: e.target.value }))}
              />
            </label>
            <label className="flex flex-1 flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700">{t("dueDate")}</span>
              <input
                type="date"
                className="input"
                value={form.dueDate}
                onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="btn-primary">
              {tc("save")}
            </button>
            <button type="button" onClick={() => setCreating(false)} className="btn-secondary">
              {tc("cancel")}
            </button>
          </div>
        </form>
      )}

      {items === null ? (
        <p className="text-sm text-gray-400">{tc("loading")}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-400">{t("noItems")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => {
            const expanded = expandedId === item.id;
            return (
              <li key={item.id} className="card">
                <button
                  onClick={() => {
                    setExpandedId(expanded ? null : item.id);
                    setReviewComments("");
                    if (!expanded && !historyById[item.id]) {
                      apiFetch<{ history: SubmittalHistoryEntry[] }>(`/submittals/${item.id}`).then((detail) =>
                        setHistoryById((h) => ({ ...h, [item.id]: detail.history })),
                      );
                    }
                  }}
                  className="flex w-full items-start justify-between gap-3 text-left"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-gray-400">
                        {item.number}
                        {item.revision > 0 ? ` rev.${item.revision}` : ""}
                      </span>
                      <span className="text-sm font-medium text-gray-900">{item.title}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[item.status]}`}>
                        {t(item.status)}
                      </span>
                      {item.specSection && <span className="text-xs text-gray-500">{item.specSection}</span>}
                      {item.dueDate && <span className="text-xs text-gray-500">{new Date(item.dueDate).toLocaleDateString()}</span>}
                    </div>
                  </div>
                </button>

                {expanded && (
                  <div className="mt-3 flex flex-col gap-2 border-t border-gray-100 pt-3 text-sm">
                    {(historyById[item.id]?.length ?? 0) > 1 && (
                      <p className="text-xs text-gray-500">
                        {t("history")}: {historyById[item.id].map((h) => `rev.${h.revision} — ${t(h.status)}`).join(", ")}
                      </p>
                    )}
                    {item.reviewComments && (
                      <p>
                        <span className="font-medium text-gray-700">{t("reviewComments")}: </span>
                        {item.reviewComments}
                        {item.reviewedByName && <span className="text-xs text-gray-400"> — {item.reviewedByName}</span>}
                      </p>
                    )}

                    {item.status === "draft" && (
                      <button onClick={() => doSubmitForReview(item.id)} className="btn-primary w-fit px-3 py-1 text-xs">
                        {t("submitForReview")}
                      </button>
                    )}

                    {item.status === "submitted" && (
                      <div className="flex flex-col gap-2">
                        <select
                          className="input w-fit"
                          value={reviewDecision}
                          onChange={(e) => setReviewDecision(e.target.value as SubmittalReviewDecision)}
                        >
                          {SUBMITTAL_REVIEW_DECISIONS.map((d) => (
                            <option key={d} value={d}>
                              {t(d)}
                            </option>
                          ))}
                        </select>
                        <textarea
                          rows={2}
                          className="input"
                          placeholder={t("reviewCommentsPlaceholder")}
                          value={reviewComments}
                          onChange={(e) => setReviewComments(e.target.value)}
                        />
                        <button onClick={() => doReview(item.id)} disabled={busy} className="btn-primary w-fit px-3 py-1 text-xs">
                          {t("submitReview")}
                        </button>
                      </div>
                    )}

                    {(item.status === "revise_and_resubmit" || item.status === "rejected") && (
                      <button onClick={() => doRevise(item.id)} className="btn-secondary w-fit px-3 py-1 text-xs">
                        {t("createRevision")}
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
