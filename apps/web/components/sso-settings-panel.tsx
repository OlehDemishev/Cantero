"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, downloadBlob } from "@/lib/api-client";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert } from "@/components/ui/alert";
import { FormError } from "@/components/ui/field";

interface SsoConfig {
  ssoDomain: string | null;
  ssoEntryPoint: string | null;
  ssoIssuer: string | null;
  ssoCert: string | null;
  ssoDomainVerified: boolean;
  verificationRecord: { type: "TXT"; name: string; value: string } | null;
}

export function SsoSettingsPanel({ canManage }: { canManage: boolean }) {
  const t = useTranslations("sso");
  const confirm = useConfirm();
  const td = useTranslations("dialog");
  const tc = useTranslations("common");

  const [config, setConfig] = useState<SsoConfig | null>(null);
  const [configError, setConfigError] = useState<Error | null>(null);
  const [form, setForm] = useState({ domain: "", entryPoint: "", issuer: "", cert: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifyFailed, setVerifyFailed] = useState(false);

  function load() {
    apiFetch<SsoConfig>("/company/sso").then((c) => {
      setConfigError(null);
      setConfig(c);
      setForm({
        domain: c.ssoDomain ?? "",
        entryPoint: c.ssoEntryPoint ?? "",
        issuer: c.ssoIssuer ?? "",
        cert: c.ssoCert ?? "",
      });
    }).catch(setConfigError);
  }

  useEffect(load, []);

  const isConfigured = config?.ssoDomain !== null && config?.ssoDomain !== undefined;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/company/sso", {
        method: "PATCH",
        body: JSON.stringify({ domain: form.domain, entryPoint: form.entryPoint, issuer: form.issuer, cert: form.cert }),
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : tc("error"));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    setError(null);
    setVerifyFailed(false);
    try {
      const result = await apiFetch<SsoConfig & { verified: boolean }>("/company/sso/verify", { method: "POST" });
      setConfig(result);
      setVerifyFailed(!result.verified);
    } catch (err) {
      setError(err instanceof Error ? err.message : tc("error"));
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (!(await confirm({ message: td("disableSso"), tone: "danger", verb: "disable" }))) return;
    setBusy(true);
    try {
      await apiFetch("/company/sso", { method: "DELETE" });
      setForm({ domain: "", entryPoint: "", issuer: "", cert: "" });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function downloadMetadata() {
    const blob = await apiFetch<Blob>("/company/sso/metadata");
    downloadBlob(blob, "cantero-sp-metadata.xml");
  }

  if (!config) return configError ? <ErrorState error={configError} onRetry={load} compact /> : <Skeleton lines={3} />;

  return (
    <section className="card lg:col-span-2">
      <h2 className="mb-1 text-sm font-semibold text-fg-muted">{t("title")}</h2>
      <p className="mb-4 text-xs text-fg-subtle">{t("hint")}</p>

      {isConfigured && config.ssoDomainVerified && (
        <p className="mb-3 text-sm text-success-fg">{t("activeSummary", { domain: config.ssoDomain! })}</p>
      )}
      {isConfigured && !config.ssoDomainVerified && (
        <Alert tone="warning" className="mb-4">
          <p className="text-sm text-warning-fg">{t("pendingSummary", { domain: config.ssoDomain! })}</p>
          {config.verificationRecord && (
            <>
              <p className="mt-2 text-xs text-gray-600 dark:text-gray-300">{t("dnsInstructions", { domain: config.ssoDomain! })}</p>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                <dt className="text-fg-subtle">{t("recordName")}</dt>
                <dd className="break-all font-mono text-fg">{config.verificationRecord.name}</dd>
                <dt className="text-fg-subtle">{t("recordValue")} (TXT)</dt>
                <dd className="break-all font-mono text-fg">{config.verificationRecord.value}</dd>
              </dl>
            </>
          )}
          {canManage && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" onClick={verify} disabled={busy} className="btn-secondary px-3 py-1 text-xs">
                {t("verifyNow")}
              </button>
              {verifyFailed && <span className="text-xs text-warning-fg">{t("verifyFailedHint")}</span>}
            </div>
          )}
        </Alert>
      )}

      <button onClick={downloadMetadata} className="btn-secondary mb-4 px-3 py-1 text-xs">
        {t("downloadMetadata")}
      </button>

      {canManage && (
        <form onSubmit={save} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-fg-muted">{t("domain")}</span>
            <input
              required
              placeholder="acme.com"
              className="input"
              value={form.domain}
              onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-fg-muted">{t("entryPoint")}</span>
            <input
              required
              placeholder="https://idp.example.com/sso/saml"
              className="input"
              value={form.entryPoint}
              onChange={(e) => setForm((f) => ({ ...f, entryPoint: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-fg-muted">{t("issuer")}</span>
            <input
              required
              placeholder={t("issuerPlaceholder")}
              className="input"
              value={form.issuer}
              onChange={(e) => setForm((f) => ({ ...f, issuer: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-fg-muted">{t("cert")}</span>
            <textarea
              required
              rows={5}
              placeholder="-----BEGIN CERTIFICATE-----"
              className="input font-mono text-xs"
              value={form.cert}
              onChange={(e) => setForm((f) => ({ ...f, cert: e.target.value }))}
            />
          </label>
          {error && <FormError>{error}</FormError>}
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="btn-primary self-start">
              {tc("save")}
            </button>
            {isConfigured && (
              <button type="button" onClick={disable} disabled={busy} className="btn-secondary self-start text-danger-fg">
                {t("disable")}
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
