"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { formatDate } from "@/lib/format-date";
import { resetStateInEffect } from "@/lib/effect-reset";

interface Status {
  connected: boolean;
  environmentUrl?: string;
  connectedAt?: string;
}

export function MsProjectSettingsPanel({ canManage }: { canManage: boolean }) {
  const t = useTranslations("msProject");

  const [status, setStatus] = useState<Status | null>(null);
  const [environmentUrl, setEnvironmentUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<Status>("/company/ms-project/status").then(setStatus);
  }

  useEffect(() => {
    load();
    const params = new URLSearchParams(window.location.search);
    if (params.get("ms_project_connected")) load();
    const err = params.get("ms_project_error");
    if (err) resetStateInEffect(() => setError(err));
    if (params.has("ms_project_connected") || params.has("ms_project_error")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  async function connect() {
    setError(null);
    try {
      const { url } = await apiFetch<{ url: string }>(
        `/company/ms-project/authorize-url?environmentUrl=${encodeURIComponent(environmentUrl)}`,
      );
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : t("connectFailed"));
    }
  }

  async function disconnect() {
    if (!window.confirm(t("confirmDisconnect"))) return;
    setBusy(true);
    try {
      await apiFetch("/company/ms-project/connection", { method: "DELETE" });
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
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-200">{t("environmentUrlLabel")}</span>
              <input
                className="input"
                placeholder={t("environmentUrlPlaceholder")}
                value={environmentUrl}
                onChange={(e) => setEnvironmentUrl(e.target.value)}
              />
            </label>
            <button onClick={connect} disabled={environmentUrl.trim().length === 0} className="btn-secondary">
              {t("connect")}
            </button>
          </div>
        )
      )}
    </section>
  );
}
