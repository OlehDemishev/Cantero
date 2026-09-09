"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  LIEN_NOTICE_DIRECTIONS,
  LIEN_NOTICE_TYPES,
  type LienFilingStatus,
  type LienNoticeDirection,
  type LienNoticeType,
} from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";
import { formatDate } from "@/lib/format-date";

interface LienNotice {
  id: string;
  direction: LienNoticeDirection;
  type: LienNoticeType;
  relatedPartyName: string;
  firstFurnishDate: string | null;
  deadlineDate: string | null;
  sentAt: string | null;
  methodOfService: string | null;
  notes: string | null;
}
interface MechanicsLienFiling {
  id: string;
  filedByName: string;
  amount: string;
  filedAt: string;
  status: LienFilingStatus;
  releasedAt: string | null;
  notes: string | null;
}

const FILING_STATUS_STYLES: Record<LienFilingStatus, string> = {
  filed: "bg-warning-50 dark:bg-warning-500/15 text-warning-700 dark:text-warning-500",
  released: "bg-success-50 dark:bg-success-500/15 text-success-700 dark:text-success-500",
  disputed: "bg-error-50 dark:bg-error-500/15 text-error-700 dark:text-error-500",
};

export function LienCompliancePanel({ projectId }: { projectId: string }) {
  const t = useTranslations("lienCompliance");
  const tc = useTranslations("common");
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "";

  const [notices, setNotices] = useState<LienNotice[] | null>(null);
  const [filings, setFilings] = useState<MechanicsLienFiling[] | null>(null);
  const [addingNotice, setAddingNotice] = useState(false);
  const [noticeForm, setNoticeForm] = useState({
    direction: "sent" as LienNoticeDirection,
    type: "preliminary_notice" as LienNoticeType,
    relatedPartyName: "",
    deadlineDate: "",
    methodOfService: "",
  });
  const [addingFiling, setAddingFiling] = useState(false);
  const [filingForm, setFilingForm] = useState({ filedByName: "", amount: "", filedAt: "" });
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<LienNotice[]>(`/projects/${projectId}/lien-notices`).then(setNotices);
    apiFetch<MechanicsLienFiling[]>(`/projects/${projectId}/lien-filings`).then(setFilings);
  }
  useEffect(load, [projectId]);

  async function createNotice(e: React.FormEvent) {
    e.preventDefault();
    if (!noticeForm.relatedPartyName.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/projects/${projectId}/lien-notices`, {
        method: "POST",
        body: JSON.stringify({
          direction: noticeForm.direction,
          type: noticeForm.type,
          relatedPartyName: noticeForm.relatedPartyName.trim(),
          deadlineDate: noticeForm.deadlineDate ? new Date(noticeForm.deadlineDate).toISOString() : undefined,
          methodOfService: noticeForm.methodOfService || undefined,
        }),
      });
      setNoticeForm({ direction: "sent", type: "preliminary_notice", relatedPartyName: "", deadlineDate: "", methodOfService: "" });
      setAddingNotice(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function markSent(id: string) {
    setBusy(true);
    try {
      await apiFetch(`/lien-notices/${id}/mark-sent`, { method: "POST" });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function createFiling(e: React.FormEvent) {
    e.preventDefault();
    if (!filingForm.filedByName.trim() || !filingForm.amount || !filingForm.filedAt) return;
    setBusy(true);
    try {
      await apiFetch(`/projects/${projectId}/lien-filings`, {
        method: "POST",
        body: JSON.stringify({
          filedByName: filingForm.filedByName.trim(),
          amount: Number(filingForm.amount),
          filedAt: new Date(filingForm.filedAt).toISOString(),
        }),
      });
      setFilingForm({ filedByName: "", amount: "", filedAt: "" });
      setAddingFiling(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function updateFilingStatus(id: string, status: LienFilingStatus) {
    setBusy(true);
    try {
      await apiFetch(`/lien-filings/${id}/status`, { method: "POST", body: JSON.stringify({ status }) });
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-10">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t("title")}</h2>
        {!addingNotice && (
          <button onClick={() => setAddingNotice(true)} className="btn-secondary px-2.5 py-1 text-xs">
            {t("logNotice")}
          </button>
        )}
      </div>
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{t("hint")}</p>

      {addingNotice && (
        <form onSubmit={createNotice} className="card mb-3 flex flex-wrap items-end gap-2">
          <select className="input" value={noticeForm.direction} onChange={(e) => setNoticeForm((f) => ({ ...f, direction: e.target.value as LienNoticeDirection }))}>
            {LIEN_NOTICE_DIRECTIONS.map((d) => (
              <option key={d} value={d}>
                {t(`direction_${d}`)}
              </option>
            ))}
          </select>
          <select className="input" value={noticeForm.type} onChange={(e) => setNoticeForm((f) => ({ ...f, type: e.target.value as LienNoticeType }))}>
            {LIEN_NOTICE_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`type_${type}`)}
              </option>
            ))}
          </select>
          <input
            required
            placeholder={t("relatedPartyNamePlaceholder")}
            className="input flex-1"
            value={noticeForm.relatedPartyName}
            onChange={(e) => setNoticeForm((f) => ({ ...f, relatedPartyName: e.target.value }))}
          />
          <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
            {t("deadlineDate")}
            <input type="date" className="input" value={noticeForm.deadlineDate} onChange={(e) => setNoticeForm((f) => ({ ...f, deadlineDate: e.target.value }))} />
          </label>
          <input
            placeholder={t("methodOfServicePlaceholder")}
            className="input w-40"
            value={noticeForm.methodOfService}
            onChange={(e) => setNoticeForm((f) => ({ ...f, methodOfService: e.target.value }))}
          />
          <button type="submit" disabled={busy} className="btn-primary">
            {tc("save")}
          </button>
          <button type="button" onClick={() => setAddingNotice(false)} className="btn-secondary">
            {tc("cancel")}
          </button>
        </form>
      )}

      {!notices ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">{tc("loading")}</p>
      ) : notices.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{t("noNotices")}</p>
      ) : (
        <ul className="mb-6 flex flex-col gap-2">
          {notices.map((n) => (
            <li key={n.id} className="card">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900 dark:text-gray-50">
                  {t(`type_${n.type}`)} · {n.relatedPartyName}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${n.sentAt ? "bg-success-50 dark:bg-success-500/15 text-success-700 dark:text-success-500" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"}`}>
                  {t(`direction_${n.direction}`)} · {n.sentAt ? t("sent") : t("pending")}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                {n.deadlineDate && `${t("deadlineDate")}: ${formatDate(new Date(n.deadlineDate))}`}
                {n.methodOfService && ` · ${n.methodOfService}`}
              </p>
              {n.direction === "sent" && !n.sentAt && (
                <button onClick={() => markSent(n.id)} disabled={busy} className="btn-secondary mt-2 px-2 py-1 text-xs">
                  {t("markSent")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t("filingsTitle")}</h3>
        {!addingFiling && (
          <button onClick={() => setAddingFiling(true)} className="btn-secondary px-2.5 py-1 text-xs">
            {t("fileLien")}
          </button>
        )}
      </div>

      {addingFiling && (
        <form onSubmit={createFiling} className="card mb-3 flex flex-wrap items-end gap-2">
          <input
            required
            placeholder={t("filedByPlaceholder")}
            className="input"
            value={filingForm.filedByName}
            onChange={(e) => setFilingForm((f) => ({ ...f, filedByName: e.target.value }))}
          />
          <input
            required
            type="number"
            step="0.01"
            min="0"
            placeholder={t("amountPlaceholder", { currency })}
            className="input w-40"
            value={filingForm.amount}
            onChange={(e) => setFilingForm((f) => ({ ...f, amount: e.target.value }))}
          />
          <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
            {t("filedAt")}
            <input required type="date" className="input" value={filingForm.filedAt} onChange={(e) => setFilingForm((f) => ({ ...f, filedAt: e.target.value }))} />
          </label>
          <button type="submit" disabled={busy} className="btn-primary">
            {tc("save")}
          </button>
          <button type="button" onClick={() => setAddingFiling(false)} className="btn-secondary">
            {tc("cancel")}
          </button>
        </form>
      )}

      {!filings ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">{tc("loading")}</p>
      ) : filings.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{t("noFilings")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {filings.map((f) => (
            <li key={f.id} className="card">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900 dark:text-gray-50">
                  {f.filedByName} · {f.amount} {currency}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${FILING_STATUS_STYLES[f.status]}`}>{t(`status_${f.status}`)}</span>
              </div>
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{t("filedAt")}: {formatDate(new Date(f.filedAt))}</p>
              {f.status === "filed" && (
                <div className="mt-2 flex gap-2">
                  <button onClick={() => updateFilingStatus(f.id, "released")} disabled={busy} className="btn-secondary px-2 py-1 text-xs">
                    {t("moveTo_released")}
                  </button>
                  <button onClick={() => updateFilingStatus(f.id, "disputed")} disabled={busy} className="text-xs text-error-700 dark:text-error-500 hover:underline">
                    {t("moveTo_disputed")}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
