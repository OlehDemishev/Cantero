"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { apiFetch, notifyApiError } from "@/lib/api-client";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { formatDate } from "@/lib/format-date";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { RecurringInvoiceForm } from "./recurring-invoice-form";
import type { RecurringInvoice } from "./types";

const RECURRING_INVOICES_PAGE_SIZE = 100;

/** Recurring invoices: generate, pause, delete, autopay, and a form for a new one. */
export function RecurringInvoices({ onInvoicesChanged }: { onInvoicesChanged: () => void }) {
  const t = useTranslations("invoices");
  const confirm = useConfirm();
  const tc = useTranslations("common");
  const [recurring, setRecurring] = useState<RecurringInvoice[] | null>(null);
  const [recurringHasMore, setRecurringHasMore] = useState(false);
  const [recurringLoadMoreBusy, setRecurringLoadMoreBusy] = useState(false);
  const [recurringBusy, setRecurringBusy] = useState(false);
  const [recurringError, setRecurringError] = useState<string | null>(null);

  function loadRecurring() {
    apiFetch<RecurringInvoice[]>("/recurring-invoices")
      .then((page) => {
        setRecurring(page);
        setRecurringHasMore(page.length === RECURRING_INVOICES_PAGE_SIZE);
      })
      .catch(notifyApiError);
  }

  async function loadMoreRecurring() {
    if (!recurring || recurring.length === 0) return;
    setRecurringLoadMoreBusy(true);
    try {
      const page = await apiFetch<RecurringInvoice[]>(
        `/recurring-invoices?cursor=${recurring[recurring.length - 1].id}`,
      );
      setRecurring([...recurring, ...page]);
      setRecurringHasMore(page.length === RECURRING_INVOICES_PAGE_SIZE);
    } finally {
      setRecurringLoadMoreBusy(false);
    }
  }

  useEffect(() => {
    loadRecurring();
  }, []);

  async function toggleRecurringActive(item: RecurringInvoice) {
    await apiFetch(
      `/recurring-invoices/${item.id}/${item.active ? "pause" : "resume"}`,
      { method: "POST" },
    );
    loadRecurring();
  }

  async function generateRecurringNow(id: string) {
    setRecurringBusy(true);
    try {
      await apiFetch(`/recurring-invoices/${id}/generate-now`, {
        method: "POST",
      });
      loadRecurring();
      onInvoicesChanged();
    } catch (err) {
      setRecurringError(err instanceof Error ? err.message : tc("error"));
    } finally {
      setRecurringBusy(false);
    }
  }

  async function deleteRecurring(id: string) {
    if (!(await confirm({ message: t("confirmDeleteRecurring"), tone: "danger", verb: "delete" }))) return;
    await apiFetch(`/recurring-invoices/${id}`, { method: "DELETE" });
    loadRecurring();
  }

  async function toggleAutopay(item: RecurringInvoice) {
    setRecurringError(null);
    try {
      await apiFetch(`/recurring-invoices/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ autopayEnabled: !item.autopayEnabled }),
      });
      loadRecurring();
    } catch (err) {
      setRecurringError(err instanceof Error ? err.message : tc("error"));
    }
  }

  return (
    <div className="mt-10">
      <h2 className="mb-1 text-sm font-semibold text-fg-muted">
        {t("recurring")}
      </h2>
      <p className="mb-4 text-xs text-fg-subtle">
        {t("recurringHint")}
      </p>
      {recurringError && (
        <Alert tone="danger" className="mb-3">
          {recurringError}
        </Alert>
      )}

      {!recurring || recurring.length === 0 ? (
        <p className="mb-4 text-sm text-fg-subtle">
          {t("noRecurring")}
        </p>
      ) : (
        <div className="mb-6 flex flex-col gap-2">
          {recurring.map((r) => (
            <div
              key={r.id}
              className="rounded-lg border border-gray-200 dark:border-gray-700 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="text-sm font-medium text-fg">
                    {r.name}
                  </span>
                  <span className="ml-2 text-xs text-fg-subtle">
                    <Link
                      href={`/clients/${r.client.id}`}
                      className="text-brand-700 dark:text-brand-400 hover:underline"
                    >
                      {r.client.name}
                    </Link>{" "}
                    ·{" "}
                    <Link
                      href={`/projects/${r.project.id}`}
                      className="text-brand-700 dark:text-brand-400 hover:underline"
                    >
                      {r.project.name}
                    </Link>{" "}
                    · {t(`frequency_${r.frequency}`)}
                  </span>
                </div>
                <Badge tone={r.active ? "success" : "neutral"}>
                  {r.active ? t("active") : t("paused")}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-fg-subtle">
                {t("nextRun")}:{" "}
                {formatDate(r.nextRunDate)}
                {r.lastGeneratedAt &&
                  ` · ${t("lastGenerated")}: ${formatDate(r.lastGeneratedAt)}`}
                {r.endDate &&
                  ` · ${t("endDate")}: ${formatDate(r.endDate)}`}
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => generateRecurringNow(r.id)}
                  disabled={recurringBusy}
                  className="btn-secondary px-2 py-1 text-xs"
                >
                  {t("generateNow")}
                </button>
                <button
                  onClick={() => toggleRecurringActive(r)}
                  className="btn-secondary px-2 py-1 text-xs"
                >
                  {r.active ? t("pause") : t("resume")}
                </button>
                <button
                  onClick={() => deleteRecurring(r.id)}
                  className="btn-secondary px-2 py-1 text-xs"
                >
                  {tc("delete")}
                </button>
                <label className="ml-auto flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={r.autopayEnabled}
                    onChange={() => toggleAutopay(r)}
                  />
                  {t("autopay")}
                </label>
              </div>
            </div>
          ))}
          {recurringHasMore && (
            <button
              onClick={loadMoreRecurring}
              disabled={recurringLoadMoreBusy}
              className="btn-secondary self-start px-2.5 py-1.5 text-xs"
            >
              {tc("loadMore")}
            </button>
          )}
        </div>
      )}

      <RecurringInvoiceForm
        busy={recurringBusy}
        setBusy={setRecurringBusy}
        setError={setRecurringError}
        onCreated={loadRecurring}
      />
    </div>
  );
}
