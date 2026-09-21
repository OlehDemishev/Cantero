"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { formatDate } from "@/lib/format-date";
import { resetStateInEffect } from "@/lib/effect-reset";

interface Status {
  connected: boolean;
  connectedAt?: string;
  changeOrderItemId?: string | null;
}

export function IntacctSettingsPanel({ canManage }: { canManage: boolean }) {
  const t = useTranslations("intacct");
  const [status, setStatus] = useState<Status | null>(null);
  const [itemId, setItemId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<Status>("/company/intacct/status").then((s) => {
      setStatus(s);
      setItemId(s.changeOrderItemId ?? "");
    });
  }

  useEffect(() => {
    load();
    const params = new URLSearchParams(window.location.search);
    const err = params.get("intacct_error");
    if (err) resetStateInEffect(() => setError(err));
    if (params.has("intacct_connected") || params.has("intacct_error")) window.history.replaceState({}, "", window.location.pathname);
  }, []);

  async function connect() {
    setError(null);
    try {
      const { url } = await apiFetch<{ url: string }>("/company/intacct/authorize-url");
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : t("connectFailed"));
    }
  }

  async function saveItem(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch("/company/intacct/settings", { method: "PATCH", body: JSON.stringify({ changeOrderItemId: itemId.trim() || null }) });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!window.confirm(t("confirmDisconnect"))) return;
    setBusy(true);
    try {
      await apiFetch("/company/intacct/connection", { method: "DELETE" });
      load();
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
          <p className="text-sm text-success-700 dark:text-success-500">{t("connectedSummary", { date: status.connectedAt ? formatDate(new Date(status.connectedAt)) : "" })}</p>
          {canManage && (
            <>
              <form onSubmit={saveItem} className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
                  {t("itemId")}
                  <input className="input" maxLength={100} value={itemId} onChange={(e) => setItemId(e.target.value)} />
                </label>
                <button type="submit" disabled={busy || itemId.trim() === (status.changeOrderItemId ?? "")} className="btn-secondary px-2.5 py-1.5 text-xs">
                  {t("saveItem")}
                </button>
              </form>
              <p className="text-xs text-gray-400 dark:text-gray-500">{t("itemIdHint")}</p>
              <div>
                <button onClick={disconnect} disabled={busy} className="btn-secondary text-error-600">
                  {t("disconnect")}
                </button>
              </div>
            </>
          )}
        </div>
      ) : canManage ? (
        <button onClick={connect} className="btn-primary">
          {t("connect")}
        </button>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400">{t("notConnected")}</p>
      )}
    </section>
  );
}
