"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_STATUSES,
  type ExpenseStatus,
} from "@cantero/shared";
import { apiFetch, downloadBlob } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/lib/use-me";
import { formatDate } from "@/lib/format-date";
import { useCan } from "@/lib/permissions";
import { formatCurrency } from "@/lib/format-currency";

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
  anomaly: {
    isAnomaly: boolean;
    historicalAverage: number | null;
    deviationPercent: number | null;
  };
}
interface Project {
  id: string;
  name: string;
}

const STATUS_STYLES: Record<ExpenseStatus, string> = {
  pending:
    "bg-warning-50 dark:bg-warning-500/15 text-warning-fg",
  approved:
    "bg-success-50 dark:bg-success-500/15 text-success-fg",
  rejected:
    "bg-error-50 dark:bg-error-500/15 text-danger-fg",
};

const EXPENSES_PAGE_SIZE = 100;

export default function ExpensesPage() {
  const t = useTranslations("expenses");
  const tc = useTranslations("common");
  const { data: me } = useMe();
  const can = useCan();
  const canApprove = can("finance.manage");
  const currency = me?.company.currency ?? "";

  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [expensesError, setExpensesError] = useState<Error | null>(null);
  const { data: projects = [] } = useApi<Project[]>("/projects");
  const [filters, setFilters] = useState({ projectId: "", status: "" });
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadMoreBusy, setLoadMoreBusy] = useState(false);

  function queryString(cursor?: string): string {
    const params = new URLSearchParams();
    if (filters.projectId) params.set("projectId", filters.projectId);
    if (filters.status) params.set("status", filters.status);
    if (cursor) params.set("cursor", cursor);
    return params.toString();
  }

  function load() {
    apiFetch<Expense[]>(`/expenses?${queryString()}`)
      .then((page) => {
        setExpensesError(null);
        setExpenses(page);
        setHasMore(page.length === EXPENSES_PAGE_SIZE);
      })
      .catch(setExpensesError);
  }

  async function loadMore() {
    if (!expenses || expenses.length === 0) return;
    setLoadMoreBusy(true);
    try {
      const page = await apiFetch<Expense[]>(
        `/expenses?${queryString(expenses[expenses.length - 1].id)}`,
      );
      setExpenses([...expenses, ...page]);
      setHasMore(page.length === EXPENSES_PAGE_SIZE);
    } finally {
      setLoadMoreBusy(false);
    }
  }

  useEffect(() => {
    load();
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
      await apiFetch(`/expenses/${id}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason: rejectReason }),
      });
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

  const totalPending = (expenses ?? [])
    .filter((e) => e.status === "pending")
    .reduce((sum, e) => sum + Number(e.amount), 0);

  return (
    <>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mt-1 text-sm text-fg-subtle">
        {t("subtitle")}
      </p>

      {totalPending > 0 && (
        <p className="mt-3 text-sm text-warning-fg">
          {t("pendingTotal", { amount: formatCurrency(totalPending, currency) })}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select
          className="input w-auto"
          value={filters.projectId}
          onChange={(e) =>
            setFilters((f) => ({ ...f, projectId: e.target.value }))
          }
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
          onChange={(e) =>
            setFilters((f) => ({ ...f, status: e.target.value }))
          }
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
          expensesError ? <ErrorState error={expensesError} onRetry={load} compact /> : <Skeleton lines={4} />
        ) : expenses.length === 0 ? (
          <p className="text-sm text-fg-subtle">
            {t("empty")}
          </p>
        ) : (
          <>
            <ul className="flex flex-col gap-2">
              {expenses.map((e) => (
                <li key={e.id} className="card">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-fg">
                          {formatCurrency(e.amount, currency)}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[e.status]}`}
                        >
                          {t(e.status)}
                        </span>
                        <span className="rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs text-gray-600 dark:text-gray-300">
                          {EXPENSE_CATEGORIES.includes(e.category as never)
                            ? t(e.category)
                            : e.category}
                        </span>
                        {e.anomaly.isAnomaly && (
                          <span
                            className="rounded-full bg-error-50 dark:bg-error-500/15 px-2 py-0.5 text-xs font-medium text-danger-fg"
                            title={t("anomalyHint", {
                              average: formatCurrency(e.anomaly.historicalAverage ?? 0, currency),
                            })}
                          >
                            {t("anomaly", {
                              percent: e.anomaly.deviationPercent ?? 0,
                            })}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-fg-subtle">
                        <Link
                          href={`/team/${e.worker.id}`}
                          className="text-brand-700 dark:text-brand-400 hover:underline"
                        >
                          {e.worker.name}
                        </Link>{" "}
                        ·{" "}
                        <Link
                          href={`/projects/${e.project.id}`}
                          className="text-brand-700 dark:text-brand-400 hover:underline"
                        >
                          {e.project.name}
                        </Link>{" "}
                        · {formatDate(new Date(e.incurredAt))}
                      </div>
                      {e.description && (
                        <div className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                          {e.description}
                        </div>
                      )}
                      {e.rejectedReason && (
                        <div className="mt-1 text-xs text-danger-fg">
                          {t("rejectedReasonLabel")}: {e.rejectedReason}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-none flex-col items-end gap-1.5">
                      {e.receiptStorageKey && (
                        <button
                          onClick={() => viewReceipt(e.id)}
                          className="text-xs text-brand-700 dark:text-brand-400 hover:underline"
                        >
                          {t("viewReceipt")}
                        </button>
                      )}
                      {canApprove && e.status === "pending" && (
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => approve(e.id)}
                            disabled={busy}
                            className="btn-secondary px-2.5 py-1 text-xs"
                          >
                            {t("approve")}
                          </button>
                          <button
                            onClick={() =>
                              setRejectingId(rejectingId === e.id ? null : e.id)
                            }
                            disabled={busy}
                            className="btn-secondary px-2.5 py-1 text-xs text-danger-fg"
                          >
                            {t("reject")}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  {rejectingId === e.id && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-gray-100 dark:border-gray-700 pt-2">
                      <input
                        className="input flex-1"
                        placeholder={t("rejectReasonPlaceholder")}
                        value={rejectReason}
                        onChange={(ev) => setRejectReason(ev.target.value)}
                      />
                      <button
                        onClick={() => reject(e.id)}
                        disabled={busy || !rejectReason.trim()}
                        className="btn-primary px-3 py-1 text-xs"
                      >
                        {t("confirmReject")}
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {hasMore && (
              <button
                onClick={loadMore}
                disabled={loadMoreBusy}
                className="btn-secondary mt-3 px-2.5 py-1.5 text-xs"
              >
                {tc("loadMore")}
              </button>
            )}
          </>
        )}
      </div>
    </>
  );
}
