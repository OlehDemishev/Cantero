"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { AccountingProviderType } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";
import { formatDate, formatDateTime } from "@/lib/format-date";
import { resetStateInEffect } from "@/lib/effect-reset";

interface Status {
  connected: boolean;
  provider?: AccountingProviderType;
  externalAccountId?: string;
  connectedAt?: string;
}
interface SyncSummary {
  synced: number;
  failed: number;
  errors: string[];
}
interface SyncLogEntry {
  id: string;
  invoiceNumber: string | null;
  subcontractorCostReference: string | null;
  status: "success" | "failed";
  errorMessage: string | null;
  attemptedAt: string;
}
interface IntegrityCheck {
  connected: boolean;
  unsyncedInvoices: { id: string; number: string; total: string }[];
  unsyncedBills: { id: string; description: string; amount: string; subcontractor: { name: string } }[];
  recentFailures: SyncLogEntry[];
}

const PROVIDER_LABELS: Record<AccountingProviderType, string> = {
  quickbooks: "QuickBooks",
  xero: "Xero",
};

export function AccountingSyncPanel({ canManage }: { canManage: boolean }) {
  const t = useTranslations("accountingSync");

  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<SyncSummary | null>(null);
  const [integrity, setIntegrity] = useState<IntegrityCheck | null>(null);
  const [history, setHistory] = useState<SyncLogEntry[] | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  function load() {
    apiFetch<Status>("/company/accounting/status").then((s) => {
      setStatus(s);
      if (s.connected) apiFetch<IntegrityCheck>("/company/accounting/integrity-check").then(setIntegrity);
    });
  }

  function toggleHistory() {
    if (showHistory) {
      setShowHistory(false);
      return;
    }
    setShowHistory(true);
    apiFetch<SyncLogEntry[]>("/company/accounting/sync-history").then(setHistory);
  }

  useEffect(() => {
    load();
    const params = new URLSearchParams(window.location.search);
    if (params.get("accounting_connected")) load();
    const err = params.get("accounting_error");
    if (err) resetStateInEffect(() => setError(err));
    if (params.has("accounting_connected") || params.has("accounting_error")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  async function connect(provider: AccountingProviderType) {
    setError(null);
    try {
      const { url } = await apiFetch<{ url: string }>(`/company/accounting/authorize-url?provider=${provider}`);
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : t("connectFailed"));
    }
  }

  async function disconnect() {
    if (!window.confirm(t("confirmDisconnect"))) return;
    setBusy(true);
    try {
      await apiFetch("/company/accounting/connection", { method: "DELETE" });
      setSyncResult(null);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function sync() {
    setBusy(true);
    setSyncResult(null);
    try {
      const result = await apiFetch<SyncSummary>("/company/accounting/sync", { method: "POST" });
      setSyncResult(result);
      apiFetch<IntegrityCheck>("/company/accounting/integrity-check").then(setIntegrity);
      if (showHistory) apiFetch<SyncLogEntry[]>("/company/accounting/sync-history").then(setHistory);
    } finally {
      setBusy(false);
    }
  }

  async function syncBills() {
    setBusy(true);
    setSyncResult(null);
    try {
      const result = await apiFetch<SyncSummary>("/company/accounting/sync-bills", { method: "POST" });
      setSyncResult(result);
      apiFetch<IntegrityCheck>("/company/accounting/integrity-check").then(setIntegrity);
      if (showHistory) apiFetch<SyncLogEntry[]>("/company/accounting/sync-history").then(setHistory);
    } finally {
      setBusy(false);
    }
  }

  if (!status) return null;

  return (
    <section className="card lg:col-span-2">
      <h2 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("title")}</h2>
      <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">{t("hint")}</p>

      {error && <p className="mb-3 text-xs text-error-600">{error}</p>}

      {status.connected ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-success-700 dark:text-success-500">
            {t("connectedSummary", {
              provider: PROVIDER_LABELS[status.provider!],
              date: status.connectedAt ? formatDate(new Date(status.connectedAt)) : "",
            })}
          </p>
          {canManage && (
            <div className="flex flex-wrap gap-2">
              <button onClick={sync} disabled={busy} className="btn-primary">
                {t("syncNow")}
              </button>
              <button onClick={syncBills} disabled={busy} className="btn-secondary">
                {t("syncBillsNow")}
              </button>
              <button onClick={disconnect} disabled={busy} className="btn-secondary text-error-600">
                {t("disconnect")}
              </button>
            </div>
          )}
          {syncResult && (
            <p className="text-xs text-gray-600 dark:text-gray-300">
              {t("syncResult", { synced: syncResult.synced, failed: syncResult.failed })}
              {syncResult.errors.length > 0 && (
                <span className="mt-1 block text-error-600">{syncResult.errors.slice(0, 3).join("; ")}</span>
              )}
            </p>
          )}

          {integrity && (
            <div className="rounded-lg border border-gray-100 dark:border-gray-700 p-3 text-xs">
              <p className="font-medium text-gray-700 dark:text-gray-200">
                {t("integrityCheck", { count: integrity.unsyncedInvoices.length })}
              </p>
              <p className="mt-1 font-medium text-gray-700 dark:text-gray-200">
                {t("integrityCheckBills", { count: integrity.unsyncedBills.length })}
              </p>
              {integrity.recentFailures.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1">
                  {integrity.recentFailures.slice(0, 5).map((f) => (
                    <li key={f.id} className="text-error-600">
                      {f.invoiceNumber ?? f.subcontractorCostReference} — {f.errorMessage} ({formatDate(new Date(f.attemptedAt))})
                    </li>
                  ))}
                </ul>
              )}
              <button onClick={toggleHistory} className="mt-2 text-brand-700 dark:text-brand-400 hover:underline">
                {showHistory ? t("hideHistory") : t("showHistory")}
              </button>
              {showHistory && (
                <ul className="mt-2 flex flex-col gap-1">
                  {!history ? (
                    <li className="text-gray-400 dark:text-gray-500">…</li>
                  ) : history.length === 0 ? (
                    <li className="text-gray-400 dark:text-gray-500">{t("noHistory")}</li>
                  ) : (
                    history.map((h) => (
                      <li key={h.id} className={h.status === "failed" ? "text-error-600" : "text-success-700 dark:text-success-500"}>
                        {formatDateTime(new Date(h.attemptedAt))} — {h.invoiceNumber ?? h.subcontractorCostReference} — {h.status}
                        {h.errorMessage ? `: ${h.errorMessage}` : ""}
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
          )}
        </div>
      ) : (
        canManage && (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => connect("quickbooks")} className="btn-secondary">
              {t("connect", { provider: "QuickBooks" })}
            </button>
            <button onClick={() => connect("xero")} className="btn-secondary">
              {t("connect", { provider: "Xero" })}
            </button>
          </div>
        )
      )}
    </section>
  );
}
