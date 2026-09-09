"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, ApiError } from "@/lib/api-client";

interface Company {
  customPortalDomain: string | null;
  customPortalDomainVerifiedAt: string | null;
}

const CNAME_TARGET = "portal.cantero.dev";

export function CustomPortalDomainPanel({ canManage }: { canManage: boolean }) {
  const t = useTranslations("customPortalDomain");
  const tc = useTranslations("common");

  const [company, setCompany] = useState<Company | null>(null);
  const [domainInput, setDomainInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<{ verified: boolean } | null>(null);

  function load() {
    apiFetch<Company>("/company").then((c) => {
      setCompany(c);
      setDomainInput(c.customPortalDomain ?? "");
    });
  }

  useEffect(load, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setVerifyResult(null);
    try {
      await apiFetch("/company/portal-domain", { method: "POST", body: JSON.stringify({ domain: domainInput || null }) });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tc("error"));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    setError(null);
    try {
      const result = await apiFetch<{ verified: boolean }>("/company/portal-domain/verify", { method: "POST" });
      setVerifyResult(result);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tc("error"));
    } finally {
      setBusy(false);
    }
  }

  if (!canManage) return null;

  return (
    <section className="card lg:col-span-2">
      <h2 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("title")}</h2>
      <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">{t("hint")}</p>

      <form onSubmit={save} className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <input
            className="input flex-1 text-xs"
            placeholder="portal.mycompany.com"
            value={domainInput}
            onChange={(e) => setDomainInput(e.target.value)}
          />
          <button type="submit" disabled={busy} className="btn-secondary shrink-0 px-3 py-1 text-xs">
            {tc("save")}
          </button>
        </div>
        {error && <p className="text-xs text-error-600">{error}</p>}
      </form>

      {company?.customPortalDomain && (
        <div className="mt-4 border-t border-gray-100 dark:border-gray-700 pt-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">{t("cnameInstructions", { target: CNAME_TARGET })}</p>
          <div className="mt-2 flex items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                company.customPortalDomainVerifiedAt ? "bg-success-50 dark:bg-success-500/15 text-success-700 dark:text-success-500" : "bg-warning-50 dark:bg-warning-500/15 text-warning-700 dark:text-warning-500"
              }`}
            >
              {company.customPortalDomainVerifiedAt ? t("verified") : t("notVerified")}
            </span>
            <button onClick={verify} disabled={busy} className="btn-secondary px-3 py-1 text-xs">
              {t("verifyNow")}
            </button>
            {verifyResult && !verifyResult.verified && <span className="text-xs text-warning-700 dark:text-warning-500">{t("verifyFailedHint")}</span>}
          </div>
          <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">{t("infraHint")}</p>
        </div>
      )}
    </section>
  );
}
