"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format-date";
import { EmptyState } from "@/components/ui/empty-state";

interface TaxJurisdiction {
  id: string;
  name: string;
}
interface TaxExemptionCertificate {
  id: string;
  certificateNumber: string;
  reason: string | null;
  expiresAt: string | null;
}
interface Client {
  taxJurisdictionId: string | null;
}

export function ClientTaxPanel({ clientId }: { clientId: string }) {
  const tt = useTranslations("tax");
  const tc = useTranslations("common");

  const [taxJurisdictions, setTaxJurisdictions] = useState<TaxJurisdiction[]>([]);
  const [taxJurisdictionId, setTaxJurisdictionId] = useState("");
  const [exemptionCertificates, setExemptionCertificates] = useState<TaxExemptionCertificate[] | null>(null);
  const [certForm, setCertForm] = useState({ certificateNumber: "", reason: "", expiresAt: "" });
  const [taxBusy, setTaxBusy] = useState(false);
  const [taxSaveMessage, setTaxSaveMessage] = useState<{ error: boolean; text: string } | null>(null);

  function loadExemptionCertificates() {
    apiFetch<TaxExemptionCertificate[]>(`/clients/${clientId}/tax-exemption-certificates`).then(setExemptionCertificates);
  }

  useEffect(() => {
    apiFetch<Client>(`/clients/${clientId}`).then((c) => setTaxJurisdictionId(c.taxJurisdictionId ?? ""));
    loadExemptionCertificates();
    apiFetch<TaxJurisdiction[]>("/tax/jurisdictions").then(setTaxJurisdictions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function saveTaxJurisdiction(e: React.FormEvent) {
    e.preventDefault();
    setTaxBusy(true);
    setTaxSaveMessage(null);
    try {
      await apiFetch(`/clients/${clientId}/tax-jurisdiction`, {
        method: "PATCH",
        body: JSON.stringify({ taxJurisdictionId: taxJurisdictionId || null }),
      });
      setTaxSaveMessage({ error: false, text: tc("saved") });
    } catch (err) {
      setTaxSaveMessage({ error: true, text: err instanceof ApiError ? err.message : tc("error") });
    } finally {
      setTaxBusy(false);
    }
  }

  async function addExemptionCertificate(e: React.FormEvent) {
    e.preventDefault();
    if (!certForm.certificateNumber.trim()) return;
    setTaxBusy(true);
    try {
      await apiFetch(`/clients/${clientId}/tax-exemption-certificates`, {
        method: "POST",
        body: JSON.stringify({
          certificateNumber: certForm.certificateNumber.trim(),
          reason: certForm.reason || undefined,
          expiresAt: certForm.expiresAt ? new Date(certForm.expiresAt).toISOString() : undefined,
        }),
      });
      setCertForm({ certificateNumber: "", reason: "", expiresAt: "" });
      loadExemptionCertificates();
    } finally {
      setTaxBusy(false);
    }
  }

  return (
    <div className="mt-6 card max-w-md">
      <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">{tt("clientTaxTitle")}</h2>
      <form onSubmit={saveTaxJurisdiction} className="flex items-center gap-2">
        <select className="input flex-1" value={taxJurisdictionId} onChange={(e) => setTaxJurisdictionId(e.target.value)}>
          <option value="">{tt("noJurisdictionAssigned")}</option>
          {taxJurisdictions.map((j) => (
            <option key={j.id} value={j.id}>
              {j.name}
            </option>
          ))}
        </select>
        <button type="submit" disabled={taxBusy} className="btn-secondary shrink-0">
          {tc("save")}
        </button>
      </form>
      {taxSaveMessage && (
        <p className={`mt-1.5 text-xs ${taxSaveMessage.error ? "text-error-700 dark:text-error-500" : "text-success-700 dark:text-success-500"}`}>{taxSaveMessage.text}</p>
      )}
      {taxJurisdictions.length === 0 && (
        <div className="mt-1.5">
          <EmptyState message={tt("noJurisdictionsConfigured")} cta={{ label: tt("manageJurisdictions"), href: "/settings?tab=billing" }} />
        </div>
      )}

      <h3 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{tt("exemptionCertificates")}</h3>
      {exemptionCertificates === null ? (
        <p className="text-xs text-gray-400 dark:text-gray-500">{tc("loading")}</p>
      ) : exemptionCertificates.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500">{tt("noExemptionCertificates")}</p>
      ) : (
        <ul className="mb-2 flex flex-col gap-1">
          {exemptionCertificates.map((cert) => (
            <li key={cert.id} className="text-xs text-gray-600 dark:text-gray-300">
              {cert.certificateNumber}
              {cert.expiresAt && <span className="text-gray-400 dark:text-gray-500"> — {tt("expiresOn", { date: formatDate(new Date(cert.expiresAt)) })}</span>}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={addExemptionCertificate} className="flex flex-wrap items-end gap-2">
        <input
          placeholder={tt("certificateNumberPlaceholder")}
          className="input w-auto"
          value={certForm.certificateNumber}
          onChange={(e) => setCertForm((f) => ({ ...f, certificateNumber: e.target.value }))}
        />
        <input type="date" className="input w-auto" value={certForm.expiresAt} onChange={(e) => setCertForm((f) => ({ ...f, expiresAt: e.target.value }))} />
        <button type="submit" disabled={taxBusy} className="btn-secondary shrink-0 px-2.5 py-1 text-xs">
          {tt("addCertificate")}
        </button>
      </form>
    </div>
  );
}
