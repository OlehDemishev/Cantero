"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { formatDate } from "@/lib/format-date";
import { resetStateInEffect } from "@/lib/effect-reset";

interface Status {
  connected: boolean;
  hubId?: string;
  connectedAt?: string;
}

export function AutodeskSettingsPanel({ canManage }: { canManage: boolean }) {
  const t = useTranslations("autodesk");

  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<Status>("/company/autodesk/status").then(setStatus);
  }

  useEffect(() => {
    load();
    const params = new URLSearchParams(window.location.search);
    if (params.get("autodesk_connected")) load();
    const err = params.get("autodesk_error");
    if (err) resetStateInEffect(() => setError(err));
    if (params.has("autodesk_connected") || params.has("autodesk_error")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  async function connect() {
    setError(null);
    try {
      const { url } = await apiFetch<{ url: string }>("/company/autodesk/authorize-url");
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : t("connectFailed"));
    }
  }

  async function disconnect() {
    if (!window.confirm(t("confirmDisconnect"))) return;
    setBusy(true);
    try {
      await apiFetch("/company/autodesk/connection", { method: "DELETE" });
      load();
    } finally {
      setBusy(false);
    }
  }

  if (!status) return null;

  return (
    <section className="card lg:col-span-2">
      <h2 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("settingsTitle")}</h2>
      <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">{t("settingsHint")}</p>

      {error && <p className="mb-3 text-xs text-error-600">{error}</p>}

      {status.connected ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-success-700 dark:text-success-500">
            {t("connectedSummary", { date: status.connectedAt ? formatDate(new Date(status.connectedAt)) : "" })}
          </p>
          {canManage && (
            <button onClick={disconnect} disabled={busy} className="btn-secondary text-error-600 w-fit">
              {t("disconnect")}
            </button>
          )}
        </div>
      ) : (
        canManage && (
          <button onClick={connect} className="btn-secondary w-fit">
            {t("connect")}
          </button>
        )
      )}
    </section>
  );
}
