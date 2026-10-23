"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";
import { resetStateInEffect } from "@/lib/effect-reset";
import { Alert } from "@/components/ui/alert";
import { FormError } from "@/components/ui/field";

export function TwoFactorSettingsPanel() {
  const t = useTranslations("twoFactor");
  const { data: me, reload: reloadMe } = useMe();

  const [setupData, setSetupData] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [enableCode, setEnableCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [disablePassword, setDisablePassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    if (me) resetStateInEffect(() => setEnabled(me.user.totpEnabled));
  }, [me]);

  async function startSetup() {
    setBusy(true);
    setError(null);
    try {
      const result = await apiFetch<{ secret: string; otpauthUrl: string }>("/auth/2fa/setup", { method: "POST" });
      setSetupData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "");
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnable(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await apiFetch<{ backupCodes: string[] }>("/auth/2fa/enable", {
        method: "POST",
        body: JSON.stringify({ code: enableCode }),
      });
      setBackupCodes(result.backupCodes);
      setSetupData(null);
      setEnableCode("");
      setEnabled(true);
      reloadMe();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("invalidCode"));
    } finally {
      setBusy(false);
    }
  }

  async function disable(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/auth/2fa", { method: "DELETE", body: JSON.stringify({ password: disablePassword }) });
      setDisablePassword("");
      setEnabled(false);
      setBackupCodes(null);
      reloadMe();
    } catch (err) {
      setError(err instanceof Error ? err.message : "");
    } finally {
      setBusy(false);
    }
  }

  const isEnabled = enabled ?? false;

  return (
    <section className="card lg:col-span-2">
      <h2 className="mb-1 text-sm font-semibold text-fg-muted">{t("title")}</h2>
      <p className="mb-4 text-xs text-fg-subtle">{t("hint")}</p>

      {error && <FormError className="mb-3">{error}</FormError>}

      {backupCodes && (
        <Alert tone="warning" className="mb-4">
          <p className="mb-2 text-xs font-semibold">{t("backupCodesTitle")}</p>
          <p className="mb-2 text-xs">{t("backupCodesHint")}</p>
          <div className="grid grid-cols-2 gap-1 font-mono text-xs text-fg">
            {backupCodes.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
        </Alert>
      )}

      {!isEnabled && !setupData && (
        <button onClick={startSetup} disabled={busy} className="btn-secondary px-3 py-1 text-xs">
          {t("enable")}
        </button>
      )}

      {setupData && (
        <form onSubmit={confirmEnable} className="flex flex-col gap-2">
          <p className="text-xs text-gray-600 dark:text-gray-300">{t("scanHint")}</p>
          <p className="break-all rounded bg-gray-50 dark:bg-gray-700 p-2 font-mono text-xs">{setupData.secret}</p>
          <label className="flex flex-col gap-1 text-xs text-fg-subtle">
            {t("codeLabel")}
            <input
              required
              className="input mt-1"
              value={enableCode}
              onChange={(e) => setEnableCode(e.target.value)}
              maxLength={6}
            />
          </label>
          <button type="submit" disabled={busy} className="btn-primary self-start">
            {t("confirm")}
          </button>
        </form>
      )}

      {isEnabled && (
        <form onSubmit={disable} className="flex items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-fg-subtle">
            {t("passwordToDisable")}
            <input
              required
              type="password"
              className="input mt-1"
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
            />
          </label>
          <button type="submit" disabled={busy} className="btn-secondary px-3 py-1 text-xs text-danger-fg">
            {t("disable")}
          </button>
        </form>
      )}
    </section>
  );
}
