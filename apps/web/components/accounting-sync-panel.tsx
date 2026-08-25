"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { AccountingProviderType } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";

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

  function load() {
    apiFetch<Status>("/company/accounting/status").then(setStatus);
  }

  useEffect(() => {
    load();
    const params = new URLSearchParams(window.location.search);
    if (params.get("accounting_connected")) load();
    const err = params.get("accounting_error");
    if (err) setError(err);
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
    } finally {
      setBusy(false);
    }
  }

  if (!status) return null;

  return (
    <section className="card lg:col-span-2">
      <h2 className="mb-1 text-sm font-semibold text-gray-700">{t("title")}</h2>
      <p className="mb-4 text-xs text-gray-500">{t("hint")}</p>

      {error && <p className="mb-3 text-xs text-error-600">{error}</p>}

      {status.connected ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-success-700">
            {t("connectedSummary", {
              provider: PROVIDER_LABELS[status.provider!],
              date: status.connectedAt ? new Date(status.connectedAt).toLocaleDateString() : "",
            })}
          </p>
          {canManage && (
            <div className="flex flex-wrap gap-2">
              <button onClick={sync} disabled={busy} className="btn-primary">
                {t("syncNow")}
              </button>
              <button onClick={disconnect} disabled={busy} className="btn-secondary text-error-600">
                {t("disconnect")}
              </button>
            </div>
          )}
          {syncResult && (
            <p className="text-xs text-gray-600">
              {t("syncResult", { synced: syncResult.synced, failed: syncResult.failed })}
              {syncResult.errors.length > 0 && (
                <span className="mt-1 block text-error-600">{syncResult.errors.slice(0, 3).join("; ")}</span>
              )}
            </p>
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
