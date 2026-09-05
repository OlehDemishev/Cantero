"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, downloadBlob } from "@/lib/api-client";

interface SsoConfig {
  ssoDomain: string | null;
  ssoEntryPoint: string | null;
  ssoIssuer: string | null;
  ssoCert: string | null;
}

export function SsoSettingsPanel({ canManage }: { canManage: boolean }) {
  const t = useTranslations("sso");
  const tc = useTranslations("common");

  const [config, setConfig] = useState<SsoConfig | null>(null);
  const [form, setForm] = useState({ domain: "", entryPoint: "", issuer: "", cert: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<SsoConfig>("/company/sso").then((c) => {
      setConfig(c);
      setForm({
        domain: c.ssoDomain ?? "",
        entryPoint: c.ssoEntryPoint ?? "",
        issuer: c.ssoIssuer ?? "",
        cert: c.ssoCert ?? "",
      });
    });
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

  async function disable() {
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

  if (!config) return null;

  return (
    <section className="card lg:col-span-2">
      <h2 className="mb-1 text-sm font-semibold text-gray-700">{t("title")}</h2>
      <p className="mb-4 text-xs text-gray-500">{t("hint")}</p>

      {isConfigured && (
        <p className="mb-3 text-sm text-success-700">{t("activeSummary", { domain: config.ssoDomain! })}</p>
      )}

      <button onClick={downloadMetadata} className="btn-secondary mb-4 px-3 py-1 text-xs">
        {t("downloadMetadata")}
      </button>

      {canManage && (
        <form onSubmit={save} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700">{t("domain")}</span>
            <input
              required
              placeholder="acme.com"
              className="input"
              value={form.domain}
              onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700">{t("entryPoint")}</span>
            <input
              required
              placeholder="https://idp.example.com/sso/saml"
              className="input"
              value={form.entryPoint}
              onChange={(e) => setForm((f) => ({ ...f, entryPoint: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700">{t("issuer")}</span>
            <input
              required
              placeholder={t("issuerPlaceholder")}
              className="input"
              value={form.issuer}
              onChange={(e) => setForm((f) => ({ ...f, issuer: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700">{t("cert")}</span>
            <textarea
              required
              rows={5}
              placeholder="-----BEGIN CERTIFICATE-----"
              className="input font-mono text-xs"
              value={form.cert}
              onChange={(e) => setForm((f) => ({ ...f, cert: e.target.value }))}
            />
          </label>
          {error && <p className="text-xs text-error-600">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="btn-primary self-start">
              {tc("save")}
            </button>
            {isConfigured && (
              <button type="button" onClick={disable} disabled={busy} className="btn-secondary self-start text-error-600">
                {t("disable")}
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
