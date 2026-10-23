"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { formatDate } from "@/lib/format-date";
import { resetStateInEffect } from "@/lib/effect-reset";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useApi } from "@/lib/use-api";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";

interface Status {
  connected: boolean;
  hubId?: string;
  connectedAt?: string;
}

export function AutodeskSettingsPanel({ canManage }: { canManage: boolean }) {
  const t = useTranslations("autodesk");
  const confirm = useConfirm();

  const { data: status = null, error: statusError, reload: reloadStatus } = useApi<Status>("/company/autodesk/status");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    void reloadStatus();
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
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
    if (!(await confirm({ message: t("confirmDisconnect"), tone: "danger", verb: "disconnect" }))) return;
    setBusy(true);
    try {
      await apiFetch("/company/autodesk/connection", { method: "DELETE" });
      load();
    } finally {
      setBusy(false);
    }
  }

  if (!status) return statusError ? <ErrorState error={statusError} onRetry={reloadStatus} compact /> : <Skeleton lines={3} />;

  return (
    <section className="card lg:col-span-2">
      <h2 className="mb-1 text-sm font-semibold text-fg-muted">{t("settingsTitle")}</h2>
      <p className="mb-4 text-xs text-fg-subtle">{t("settingsHint")}</p>

      {error && <p className="mb-3 text-xs text-danger-fg">{error}</p>}

      {status.connected ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-success-fg">
            {t("connectedSummary", { date: status.connectedAt ? formatDate(new Date(status.connectedAt)) : "" })}
          </p>
          {canManage && (
            <button onClick={disconnect} disabled={busy} className="btn-secondary text-danger-fg w-fit">
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
