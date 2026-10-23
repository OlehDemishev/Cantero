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
import { FormError } from "@/components/ui/field";

interface Status {
  connected: boolean;
  accountId?: string;
  connectedAt?: string;
}

export function DocusignSettingsPanel({ canManage }: { canManage: boolean }) {
  const t = useTranslations("docusign");
  const confirm = useConfirm();

  const { data: status = null, error: statusError, reload: reloadStatus } = useApi<Status>("/company/docusign/status");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    void reloadStatus();
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("docusign_error");
    if (err) resetStateInEffect(() => setError(err));
    if (params.has("docusign_connected") || params.has("docusign_error")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  async function connect() {
    setError(null);
    try {
      const { url } = await apiFetch<{ url: string }>("/company/docusign/authorize-url");
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : t("connectFailed"));
    }
  }

  async function disconnect() {
    if (!(await confirm({ message: t("confirmDisconnect"), tone: "danger", verb: "disconnect" }))) return;
    setBusy(true);
    try {
      await apiFetch("/company/docusign/connection", { method: "DELETE" });
      load();
    } finally {
      setBusy(false);
    }
  }

  if (!status) return statusError ? <ErrorState error={statusError} onRetry={reloadStatus} compact /> : <Skeleton lines={3} />;

  return (
    <section className="card lg:col-span-2">
      <h2 className="mb-1 text-sm font-semibold text-fg-muted">{t("title")}</h2>
      <p className="mb-4 text-xs text-fg-subtle">{t("hint")}</p>

      {error && <FormError className="mb-3">{error}</FormError>}

      {status.connected ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-success-fg">
            {t("connectedSummary", { date: status.connectedAt ? formatDate(new Date(status.connectedAt)) : "" })}
          </p>
          {canManage && (
            <div className="flex flex-wrap gap-2">
              <button onClick={disconnect} disabled={busy} className="btn-secondary text-danger-fg">
                {t("disconnect")}
              </button>
            </div>
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
