"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { EXPENSE_CATEGORIES, EXPENSE_STATUSES, type ExpenseStatus } from "@cantero/shared";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { apiFetch, downloadBlob } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";
import { formatDate } from "@/lib/format-date";

interface Expense {
  id: string;
  category: string;
  amount: string;
  description: string | null;
  incurredAt: string;
  status: ExpenseStatus;
  rejectedReason: string | null;
  receiptStorageKey: string | null;
  worker: { id: string; name: string };
  project: { id: string; name: string };
  anomaly: { isAnomaly: boolean; historicalAverage: number | null; deviationPercent: number | null };
}
interface Project {
  id: string;
  name: string;
}

const STATUS_STYLES: Record<ExpenseStatus, string> = {
  pending: "bg-warning-50 text-warning-700",
  approved: "bg-success-50 text-success-700",
  rejected: "bg-error-50 text-error-700",
};

export default function ExpensesPage() {
  const t = useTranslations("expenses");
  const tc = useTranslations("common");
  const { data: me } = useMe();
  const canApprove = me?.user.role === "owner" || me?.user.role === "admin" || me?.user.role === "accountant";
  const currency = me?.company.currency ?? "";

  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [filters, setFilters] = useState({ projectId: "", status: "" });
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    const params = new URLSearchParams();
    if (filters.projectId) params.set("projectId", filters.projectId);
    if (filters.status) params.set("status", filters.status);
    apiFetch<Expense[]>(`/expenses?${params.toString()}`).then(setExpenses);
  }

  useEffect(() => {
    load();
    apiFetch<Project[]>("/projects").then(setProjects);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.projectId, filters.status]);

  async function approve(id: string) {
    setBusy(true);
    try {
      await apiFetch(`/expenses/${id}/approve`, { method: "POST" });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function reject(id: string) {
    if (!rejectReason.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/expenses/${id}/reject`, { method: "POST", body: JSON.stringify({ reason: rejectReason }) });
      setRejectingId(null);
      setRejectReason("");
      load();
    } finally {
      setBusy(false);
    }
  }

  async function viewReceipt(id: string) {
    const blob = await apiFetch<Blob>(`/expenses/${id}/receipt`);
    downloadBlob(blob, `receipt-${id}`);
  }

  const totalPending = (expenses ?? []).filter((e) => e.status === "pending").reduce((sum, e) => sum + Number(e.amount), 0);

  return (
    <AuthenticatedShell>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mt-1 text-sm text-gray-500">{t("subtitle")}</p>

      {totalPending > 0 && (
        <p className="mt-3 text-sm text-warning-700">{t("pendingTotal", { amount: totalPending.toFixed(2), currency })}</p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select
          className="input w-auto"
          value={filters.projectId}
          onChange={(e) => setFilters((f) => ({ ...f, projectId: e.target.value }))}
        >
          <option value="">{t("allProjects")}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          className="input w-auto"
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
        >
          <option value="">{t("allStatuses")}</option>
          {EXPENSE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(s)}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4">
        {expenses === null ? (
          <p className="text-sm text-gray-400">{tc("loading")}</p>
        ) : expenses.length === 0 ? (
          <p className="text-sm text-gray-400">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {expenses.map((e) => (
              <li key={e.id} className="card">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">
                        {e.amount} {currency}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[e.status]}`}>{t(e.status)}</span>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                        {EXPENSE_CATEGORIES.includes(e.category as never) ? t(e.category) : e.category}
                      </span>
                      {e.anomaly.isAnomaly && (
                        <span
                          className="rounded-full bg-error-50 px-2 py-0.5 text-xs font-medium text-error-700"
                          title={t("anomalyHint", { average: e.anomaly.historicalAverage ?? 0, currency })}
                        >
                          {t("anomaly", { percent: e.anomaly.deviationPercent ?? 0 })}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      <Link href={`/team/${e.worker.id}`} className="text-brand-700 hover:underline">
                        {e.worker.name}
                      </Link>{" "}
                      ·{" "}
                      <Link href={`/projects/${e.project.id}`} className="text-brand-700 hover:underline">
                        {e.project.name}
                      </Link>{" "}
                      · {formatDate(new Date(e.incurredAt))}
                    </div>
                    {e.description && <div className="mt-1 text-xs text-gray-600">{e.description}</div>}
                    {e.rejectedReason && (
                      <div className="mt-1 text-xs text-error-700">
                        {t("rejectedReasonLabel")}: {e.rejectedReason}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-none flex-col items-end gap-1.5">
                    {e.receiptStorageKey && (
                      <button onClick={() => viewReceipt(e.id)} className="text-xs text-brand-700 hover:underline">
                        {t("viewReceipt")}
                      </button>
                    )}
                    {canApprove && e.status === "pending" && (
                      <div className="flex gap-1.5">
                        <button onClick={() => approve(e.id)} disabled={busy} className="btn-secondary px-2.5 py-1 text-xs">
                          {t("approve")}
                        </button>
                        <button
                          onClick={() => setRejectingId(rejectingId === e.id ? null : e.id)}
                          disabled={busy}
                          className="btn-secondary px-2.5 py-1 text-xs text-error-600"
                        >
                          {t("reject")}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                {rejectingId === e.id && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-2">
                    <input
                      className="input flex-1"
                      placeholder={t("rejectReasonPlaceholder")}
                      value={rejectReason}
                      onChange={(ev) => setRejectReason(ev.target.value)}
                    />
                    <button onClick={() => reject(e.id)} disabled={busy || !rejectReason.trim()} className="btn-primary px-3 py-1 text-xs">
                      {t("confirmReject")}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </AuthenticatedShell>
  );
}
