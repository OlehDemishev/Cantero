"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { SubcontractorBackchargeStatus, SubcontractorDefaultNoticeStatus } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";
import { formatCurrency } from "@/lib/format-currency";
import { formatDate } from "@/lib/format-date";

interface Subcontractor {
  id: string;
  name: string;
}
interface WarrantyClaimOption {
  id: string;
  title: string;
}
interface Backcharge {
  id: string;
  description: string;
  amount: number;
  status: SubcontractorBackchargeStatus;
  createdAt: string;
  subcontractor: Subcontractor;
  warrantyClaim: WarrantyClaimOption | null;
}
interface DefaultNotice {
  id: string;
  title: string;
  description: string;
  noticeDate: string;
  cureDeadline: string | null;
  status: SubcontractorDefaultNoticeStatus;
  subcontractor: Subcontractor;
}

const BACKCHARGE_STATUS_STYLES: Record<SubcontractorBackchargeStatus, string> = {
  pending: "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300",
  deducted: "bg-success-50 dark:bg-success-500/15 text-success-700 dark:text-success-500",
  waived: "bg-warning-50 dark:bg-warning-500/15 text-warning-700 dark:text-warning-500",
};
const NOTICE_STATUS_STYLES: Record<SubcontractorDefaultNoticeStatus, string> = {
  issued: "bg-error-50 dark:bg-error-500/15 text-error-700 dark:text-error-500",
  cured: "bg-success-50 dark:bg-success-500/15 text-success-700 dark:text-success-500",
  terminated: "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300",
};

export function SubcontractorClaimsPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("subcontractorClaims");
  const tc = useTranslations("common");
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "USD";
  const money = (amount: number | string) => formatCurrency(amount, currency, me?.company.locale);

  const [backcharges, setBackcharges] = useState<Backcharge[] | null>(null);
  const [notices, setNotices] = useState<DefaultNotice[] | null>(null);
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [warrantyClaims, setWarrantyClaims] = useState<WarrantyClaimOption[]>([]);
  const [creatingBackcharge, setCreatingBackcharge] = useState(false);
  const [backchargeForm, setBackchargeForm] = useState({ subcontractorId: "", description: "", amount: "", warrantyClaimId: "" });
  const [creatingNotice, setCreatingNotice] = useState(false);
  const [noticeForm, setNoticeForm] = useState({ subcontractorId: "", title: "", description: "", curePeriodDays: "" });
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<Backcharge[]>(`/projects/${projectId}/subcontractor-backcharges`).then(setBackcharges);
    apiFetch<DefaultNotice[]>(`/projects/${projectId}/subcontractor-default-notices`).then(setNotices);
  }

  useEffect(() => {
    load();
    apiFetch<Subcontractor[]>("/finance/subcontractors").then((list) => {
      setSubcontractors(list);
      if (list[0]) {
        setBackchargeForm((f) => ({ ...f, subcontractorId: f.subcontractorId || list[0].id }));
        setNoticeForm((f) => ({ ...f, subcontractorId: f.subcontractorId || list[0].id }));
      }
    });
    apiFetch<WarrantyClaimOption[]>(`/warranty-claims?projectId=${projectId}`).then(setWarrantyClaims);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function submitBackcharge(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/projects/${projectId}/subcontractor-backcharges`, {
        method: "POST",
        body: JSON.stringify({
          subcontractorId: backchargeForm.subcontractorId,
          description: backchargeForm.description,
          amount: Number(backchargeForm.amount),
          warrantyClaimId: backchargeForm.warrantyClaimId || undefined,
        }),
      });
      setBackchargeForm((f) => ({ ...f, description: "", amount: "", warrantyClaimId: "" }));
      setCreatingBackcharge(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function resolveBackcharge(id: string, action: "deduct" | "waive") {
    await apiFetch(`/subcontractor-backcharges/${id}/${action}`, { method: "POST" });
    load();
  }

  async function submitNotice(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/projects/${projectId}/subcontractor-default-notices`, {
        method: "POST",
        body: JSON.stringify({
          subcontractorId: noticeForm.subcontractorId,
          title: noticeForm.title,
          description: noticeForm.description,
          curePeriodDays: noticeForm.curePeriodDays ? Number(noticeForm.curePeriodDays) : undefined,
        }),
      });
      setNoticeForm((f) => ({ ...f, title: "", description: "", curePeriodDays: "" }));
      setCreatingNotice(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function resolveNotice(id: string, action: "cure" | "terminate") {
    if (action === "terminate" && !window.confirm(t("confirmTerminate"))) return;
    await apiFetch(`/subcontractor-default-notices/${id}/${action}`, { method: "POST" });
    load();
  }

  return (
    <div className="mt-10">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t("backchargesTitle")}</h2>
        {!creatingBackcharge && (
          <button onClick={() => setCreatingBackcharge(true)} className="btn-secondary px-3 py-1 text-xs">
            {t("newBackcharge")}
          </button>
        )}
      </div>

      {creatingBackcharge && (
        <form onSubmit={submitBackcharge} className="card mb-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700 dark:text-gray-200">{t("subcontractor")}</span>
            <select
              className="input"
              value={backchargeForm.subcontractorId}
              onChange={(e) => setBackchargeForm((f) => ({ ...f, subcontractorId: e.target.value }))}
            >
              {subcontractors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700 dark:text-gray-200">{t("description")}</span>
            <textarea
              required
              rows={2}
              className="input"
              value={backchargeForm.description}
              onChange={(e) => setBackchargeForm((f) => ({ ...f, description: e.target.value }))}
            />
          </label>
          <label className="flex w-40 flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700 dark:text-gray-200">{t("amount")}</span>
            <input
              required
              type="number"
              min="0"
              step="0.01"
              className="input"
              value={backchargeForm.amount}
              onChange={(e) => setBackchargeForm((f) => ({ ...f, amount: e.target.value }))}
            />
          </label>
          {warrantyClaims.length > 0 && (
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-200">{t("linkedWarrantyClaim")}</span>
              <select
                className="input"
                value={backchargeForm.warrantyClaimId}
                onChange={(e) => setBackchargeForm((f) => ({ ...f, warrantyClaimId: e.target.value }))}
              >
                <option value="">{tc("none")}</option>
                {warrantyClaims.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={busy || !subcontractors.length} className="btn-primary">
              {tc("save")}
            </button>
            <button type="button" onClick={() => setCreatingBackcharge(false)} className="btn-secondary">
              {tc("cancel")}
            </button>
          </div>
        </form>
      )}

      {backcharges === null ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{tc("loading")}</p>
      ) : backcharges.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{t("noBackcharges")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {backcharges.map((b) => (
            <li key={b.id} className="card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-50">{b.subcontractor.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BACKCHARGE_STATUS_STYLES[b.status]}`}>
                      {t(b.status)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{b.description}</p>
                  {b.warrantyClaim && <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{t("recoveryFor", { title: b.warrantyClaim.title })}</p>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-50">{money(b.amount)}</span>
                  {b.status === "pending" && (
                    <div className="flex gap-1.5">
                      <button onClick={() => resolveBackcharge(b.id, "deduct")} className="btn-secondary px-2.5 py-1 text-xs">
                        {t("markDeducted")}
                      </button>
                      <button onClick={() => resolveBackcharge(b.id, "waive")} className="btn-secondary px-2.5 py-1 text-xs">
                        {t("markWaived")}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mb-3 mt-8 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t("defaultNoticesTitle")}</h2>
        {!creatingNotice && (
          <button onClick={() => setCreatingNotice(true)} className="btn-secondary px-3 py-1 text-xs">
            {t("newDefaultNotice")}
          </button>
        )}
      </div>

      {creatingNotice && (
        <form onSubmit={submitNotice} className="card mb-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700 dark:text-gray-200">{t("subcontractor")}</span>
            <select
              className="input"
              value={noticeForm.subcontractorId}
              onChange={(e) => setNoticeForm((f) => ({ ...f, subcontractorId: e.target.value }))}
            >
              {subcontractors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700 dark:text-gray-200">{t("noticeTitleField")}</span>
            <input required className="input" value={noticeForm.title} onChange={(e) => setNoticeForm((f) => ({ ...f, title: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700 dark:text-gray-200">{t("description")}</span>
            <textarea
              required
              rows={3}
              className="input"
              value={noticeForm.description}
              onChange={(e) => setNoticeForm((f) => ({ ...f, description: e.target.value }))}
            />
          </label>
          <label className="flex w-40 flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700 dark:text-gray-200">{t("curePeriodDays")}</span>
            <input
              type="number"
              min="1"
              className="input"
              value={noticeForm.curePeriodDays}
              onChange={(e) => setNoticeForm((f) => ({ ...f, curePeriodDays: e.target.value }))}
            />
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={busy || !subcontractors.length} className="btn-primary">
              {tc("save")}
            </button>
            <button type="button" onClick={() => setCreatingNotice(false)} className="btn-secondary">
              {tc("cancel")}
            </button>
          </div>
        </form>
      )}

      {notices === null ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{tc("loading")}</p>
      ) : notices.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{t("noDefaultNotices")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {notices.map((n) => (
            <li key={n.id} className="card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-50">{n.title}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${NOTICE_STATUS_STYLES[n.status]}`}>{t(n.status)}</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{n.subcontractor.name}</p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{n.description}</p>
                  {n.cureDeadline && (
                    <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">{t("cureDeadline", { date: formatDate(new Date(n.cureDeadline)) })}</p>
                  )}
                </div>
                {n.status === "issued" && (
                  <div className="flex shrink-0 gap-1.5">
                    <button onClick={() => resolveNotice(n.id, "cure")} className="btn-secondary px-2.5 py-1 text-xs">
                      {t("markCured")}
                    </button>
                    <button onClick={() => resolveNotice(n.id, "terminate")} className="btn-secondary px-2.5 py-1 text-xs">
                      {t("markTerminated")}
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
