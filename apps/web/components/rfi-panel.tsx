"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { RfiPriority, RfiStatus } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";

interface Rfi {
  id: string;
  number: string;
  subject: string;
  question: string;
  priority: RfiPriority;
  status: RfiStatus;
  dueDate: string | null;
  costImpact: boolean;
  scheduleImpactDays: number | null;
  askedByName: string;
  answer: string | null;
  answeredByName: string | null;
  closedByName: string | null;
}

const STATUS_STYLES: Record<RfiStatus, string> = {
  open: "bg-gray-100 text-gray-600",
  answered: "bg-warning-50 text-warning-700",
  closed: "bg-success-50 text-success-700",
};
const PRIORITY_STYLES: Record<RfiPriority, string> = {
  low: "bg-gray-100 text-gray-500",
  medium: "bg-brand-50 text-brand-700",
  high: "bg-error-50 text-error-700",
};

const EMPTY_FORM = { subject: "", question: "", priority: "medium" as RfiPriority, dueDate: "", costImpact: false, scheduleImpactDays: "" };

export function RfiPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("rfi");
  const tc = useTranslations("common");

  const [items, setItems] = useState<Rfi[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [answerDraft, setAnswerDraft] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<Rfi[]>(`/rfis?projectId=${projectId}`).then(setItems);
  }

  useEffect(load, [projectId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch("/rfis", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          subject: form.subject,
          question: form.question,
          priority: form.priority,
          dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : undefined,
          costImpact: form.costImpact,
          scheduleImpactDays: form.scheduleImpactDays ? Number(form.scheduleImpactDays) : undefined,
        }),
      });
      setForm(EMPTY_FORM);
      setCreating(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function submitAnswer(id: string) {
    if (!answerDraft.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/rfis/${id}/answer`, { method: "POST", body: JSON.stringify({ answer: answerDraft }) });
      setAnswerDraft("");
      load();
    } finally {
      setBusy(false);
    }
  }

  async function transition(id: string, action: "close" | "reopen") {
    await apiFetch(`/rfis/${id}/${action}`, { method: "POST" });
    load();
  }

  return (
    <div className="mt-10">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">{t("title")}</h2>
        {!creating && (
          <button onClick={() => setCreating(true)} className="btn-secondary px-3 py-1 text-xs">
            {t("newRfi")}
          </button>
        )}
      </div>

      {creating && (
        <form onSubmit={submit} className="card mb-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700">{t("subject")}</span>
            <input
              required
              className="input"
              value={form.subject}
              onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700">{t("question")}</span>
            <textarea
              required
              rows={3}
              className="input"
              value={form.question}
              onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))}
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700">{t("priority")}</span>
              <select
                className="input"
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as RfiPriority }))}
              >
                <option value="low">{t("low")}</option>
                <option value="medium">{t("medium")}</option>
                <option value="high">{t("high")}</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700">{t("dueDate")}</span>
              <input
                type="date"
                className="input"
                value={form.dueDate}
                onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700">{t("scheduleImpactDays")}</span>
              <input
                type="number"
                min="0"
                className="input w-28"
                value={form.scheduleImpactDays}
                onChange={(e) => setForm((f) => ({ ...f, scheduleImpactDays: e.target.value }))}
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.costImpact}
              onChange={(e) => setForm((f) => ({ ...f, costImpact: e.target.checked }))}
            />
            {t("costImpact")}
          </label>
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
                    setAnswerDraft("");
                  }}
                  className="flex w-full items-start justify-between gap-3 text-left"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-gray-400">{item.number}</span>
                      <span className="text-sm font-medium text-gray-900">{item.subject}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[item.status]}`}>
                        {t(item.status)}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_STYLES[item.priority]}`}>
                        {t(item.priority)}
                      </span>
                      {item.costImpact && (
                        <span className="rounded-full bg-error-50 px-2 py-0.5 text-xs font-medium text-error-700">
                          {t("costImpact")}
                        </span>
                      )}
                      {item.dueDate && <span className="text-xs text-gray-500">{new Date(item.dueDate).toLocaleDateString()}</span>}
                    </div>
                  </div>
                </button>

                {expanded && (
                  <div className="mt-3 flex flex-col gap-2 border-t border-gray-100 pt-3 text-sm">
                    <p>
                      <span className="font-medium text-gray-700">{t("question")}: </span>
                      {item.question}
                    </p>
                    {item.scheduleImpactDays != null && (
                      <p>
                        <span className="font-medium text-gray-700">{t("scheduleImpactDays")}: </span>
                        {item.scheduleImpactDays}
                      </p>
                    )}
                    {item.answer && (
                      <p>
                        <span className="font-medium text-gray-700">{t("answer")}: </span>
                        {item.answer}
                        {item.answeredByName && <span className="text-xs text-gray-400"> — {item.answeredByName}</span>}
                      </p>
                    )}
                    {item.status === "closed" && item.closedByName && (
                      <p className="text-xs text-success-700">{t("closedBy", { name: item.closedByName })}</p>
                    )}

                    {item.status !== "closed" && (
                      <div className="mt-1 flex flex-col gap-2">
                        <textarea
                          rows={2}
                          className="input"
                          placeholder={t("answerPlaceholder")}
                          value={answerDraft}
                          onChange={(e) => setAnswerDraft(e.target.value)}
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => submitAnswer(item.id)}
                            disabled={busy || !answerDraft.trim()}
                            className="btn-primary w-fit px-3 py-1 text-xs"
                          >
                            {t("submitAnswer")}
                          </button>
                          <button onClick={() => transition(item.id, "close")} className="btn-secondary w-fit px-3 py-1 text-xs">
                            {t("close")}
                          </button>
                        </div>
                      </div>
                    )}
                    {item.status === "closed" && (
                      <button onClick={() => transition(item.id, "reopen")} className="btn-secondary mt-1 w-fit px-3 py-1 text-xs">
                        {t("reopen")}
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
