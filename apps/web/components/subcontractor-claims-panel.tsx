"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { SubcontractorBackchargeStatus, SubcontractorDefaultNoticeStatus } from "@cantero/shared";
import { apiFetch, notifyApiError } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";
import { formatCurrency } from "@/lib/format-currency";
import { formatDate } from "@/lib/format-date";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/lib/use-api";
import { Badge } from "@/components/ui/badge";
import { statusTone } from "@/lib/status-tone";
import { Field } from "@/components/ui/field";

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

export function SubcontractorClaimsPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("subcontractorClaims");
  const confirm = useConfirm();
  const tc = useTranslations("common");
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "USD";
  const money = (amount: number | string) => formatCurrency(amount, currency);

  const {
    data: backcharges = null,
    error: backchargesError,
    reload: reloadBackcharges,
  } = useApi<Backcharge[]>(`/projects/${projectId}/subcontractor-backcharges`);
  const {
    data: notices = null,
    error: noticesError,
    reload: reloadNotices,
  } = useApi<DefaultNotice[]>(`/projects/${projectId}/subcontractor-default-notices`);
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [warrantyClaims, setWarrantyClaims] = useState<WarrantyClaimOption[]>([]);
  const [creatingBackcharge, setCreatingBackcharge] = useState(false);
  const [backchargeForm, setBackchargeForm] = useState({ subcontractorId: "", description: "", amount: "", warrantyClaimId: "" });
  const [creatingNotice, setCreatingNotice] = useState(false);
  const [noticeForm, setNoticeForm] = useState({ subcontractorId: "", title: "", description: "", curePeriodDays: "" });
  const [busy, setBusy] = useState(false);

  function load() {
    void reloadBackcharges();
    void reloadNotices();
  }

  useEffect(() => {
    apiFetch<Subcontractor[]>("/finance/subcontractors").then((list) => {
      setSubcontractors(list);
      if (list[0]) {
        setBackchargeForm((f) => ({ ...f, subcontractorId: f.subcontractorId || list[0].id }));
        setNoticeForm((f) => ({ ...f, subcontractorId: f.subcontractorId || list[0].id }));
      }
    }).catch(notifyApiError);
    apiFetch<WarrantyClaimOption[]>(`/warranty-claims?projectId=${projectId}`).then(setWarrantyClaims).catch(notifyApiError);
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
    if (action === "terminate" && !(await confirm({ message: t("confirmTerminate"), tone: "danger", verb: "terminate" }))) return;
    await apiFetch(`/subcontractor-default-notices/${id}/${action}`, { method: "POST" });
    load();
  }

  return (
    <div className="mt-10">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-fg-muted">{t("backchargesTitle")}</h2>
        {!creatingBackcharge && (
          <button onClick={() => setCreatingBackcharge(true)} className="btn-secondary px-3 py-1 text-xs">
            {t("newBackcharge")}
          </button>
        )}
      </div>

      {creatingBackcharge && (
        <form onSubmit={submitBackcharge} className="card mb-4 flex flex-col gap-3">
          <Field label={t("subcontractor")}>
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
          </Field>
          <Field label={t("description")}>
            <textarea
              required
              rows={2}
              className="input"
              value={backchargeForm.description}
              onChange={(e) => setBackchargeForm((f) => ({ ...f, description: e.target.value }))}
            />
          </Field>
          <Field label={t("amount")} className="w-40">
            <input
              required
              type="number"
              min="0"
              step="0.01"
              className="input"
              value={backchargeForm.amount}
              onChange={(e) => setBackchargeForm((f) => ({ ...f, amount: e.target.value }))}
            />
          </Field>
          {warrantyClaims.length > 0 && (
            <Field label={t("linkedWarrantyClaim")}>
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
            </Field>
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
        backchargesError ? <ErrorState error={backchargesError} onRetry={reloadBackcharges} compact /> : <Skeleton lines={3} />
      ) : backcharges.length === 0 ? (
        <p className="text-sm text-fg-subtle">{t("noBackcharges")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {backcharges.map((b) => (
            <li key={b.id} className="card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-fg">{b.subcontractor.name}</span>
                    <Badge tone={statusTone(b.status)}>
                      {t(b.status)}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-fg-subtle">{b.description}</p>
                  {b.warrantyClaim && <p className="mt-1 text-xs text-fg-subtle">{t("recoveryFor", { title: b.warrantyClaim.title })}</p>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className="text-sm font-semibold tabular-nums text-fg">{money(b.amount)}</span>
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
        <h2 className="text-sm font-semibold text-fg-muted">{t("defaultNoticesTitle")}</h2>
        {!creatingNotice && (
          <button onClick={() => setCreatingNotice(true)} className="btn-secondary px-3 py-1 text-xs">
            {t("newDefaultNotice")}
          </button>
        )}
      </div>

      {creatingNotice && (
        <form onSubmit={submitNotice} className="card mb-4 flex flex-col gap-3">
          <Field label={t("subcontractor")}>
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
          </Field>
          <Field label={t("noticeTitleField")}>
            <input required className="input" value={noticeForm.title} onChange={(e) => setNoticeForm((f) => ({ ...f, title: e.target.value }))} />
          </Field>
          <Field label={t("description")}>
            <textarea
              required
              rows={3}
              className="input"
              value={noticeForm.description}
              onChange={(e) => setNoticeForm((f) => ({ ...f, description: e.target.value }))}
            />
          </Field>
          <Field label={t("curePeriodDays")} className="w-40">
            <input
              type="number"
              min="1"
              className="input"
              value={noticeForm.curePeriodDays}
              onChange={(e) => setNoticeForm((f) => ({ ...f, curePeriodDays: e.target.value }))}
            />
          </Field>
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
        noticesError ? <ErrorState error={noticesError} onRetry={reloadNotices} compact /> : <Skeleton lines={3} />
      ) : notices.length === 0 ? (
        <p className="text-sm text-fg-subtle">{t("noDefaultNotices")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {notices.map((n) => (
            <li key={n.id} className="card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-fg">{n.title}</span>
                    <Badge tone={statusTone(n.status)}>{t(n.status)}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-fg-subtle">{n.subcontractor.name}</p>
                  <p className="mt-1 text-xs text-fg-subtle">{n.description}</p>
                  {n.cureDeadline && (
                    <p className="mt-1.5 text-xs text-fg-subtle">{t("cureDeadline", { date: formatDate(new Date(n.cureDeadline)) })}</p>
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
