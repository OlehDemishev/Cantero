"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { CustomFieldsValuesPanel } from "@/components/custom-fields-values-panel";
import { ClientDealPanel } from "@/components/client-deal-panel";
import { ClientBillingAddressPanel } from "@/components/client-billing-address-panel";
import { ClientTaxPanel } from "@/components/client-tax-panel";
import { ClientActivityPanel } from "@/components/client-activity-panel";
import { ClientRemindersPanel } from "@/components/client-reminders-panel";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";
import { goBack } from "@/lib/back-navigation";

type ClientStage = "lead" | "contacted" | "qualified" | "won" | "lost";
const STAGES: ClientStage[] = ["lead", "contacted", "qualified", "won", "lost"];

interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  stage: ClientStage;
  estimatedValue: number | null;
  owner: { id: string; name: string } | null;
  lostReason: string | null;
}

export function ClientDetail({ clientId }: { clientId: string }) {
  const t = useTranslations("clients");
  const tc = useTranslations("common");
  const router = useRouter();
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "";
  const isManager = me?.user.role === "owner" || me?.user.role === "admin";

  const [client, setClient] = useState<Client | null>(null);
  const [busy, setBusy] = useState(false);
  const [losingStage, setLosingStage] = useState(false);
  const [lostReasonDraft, setLostReasonDraft] = useState("");
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [convertForm, setConvertForm] = useState({ name: "", address: "" });

  function load() {
    apiFetch<Client>(`/clients/${clientId}`).then(setClient);
  }

  useEffect(load, [clientId]);

  async function moveStage(stage: ClientStage) {
    if (stage === "lost") {
      setLosingStage(true);
      setLostReasonDraft("");
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`/clients/${clientId}/move-stage`, { method: "POST", body: JSON.stringify({ stage }) });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function confirmLost() {
    if (!lostReasonDraft.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/clients/${clientId}/move-stage`, {
        method: "POST",
        body: JSON.stringify({ stage: "lost", lostReason: lostReasonDraft }),
      });
      setLosingStage(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  function startConvert() {
    setConverting(true);
    setConvertForm({ name: client?.name ?? "", address: "" });
  }

  async function submitConvert(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setConvertError(null);
    try {
      const project = await apiFetch<{ id: string }>(`/clients/${clientId}/convert-to-project`, {
        method: "POST",
        body: JSON.stringify({ name: convertForm.name, address: convertForm.address || undefined }),
      });
      router.push(`/projects/${project.id}`);
    } catch (err) {
      setConvertError(err instanceof ApiError ? err.message : tc("error"));
      setBusy(false);
    }
  }

  if (!client) {
    return (
      <AuthenticatedShell>
        <p className="text-gray-500 dark:text-gray-400">{tc("loading")}</p>
      </AuthenticatedShell>
    );
  }

  return (
    <AuthenticatedShell>
      <button onClick={() => goBack(router, "/clients")} className="text-sm text-gray-500 dark:text-gray-400 hover:underline">
        ← {t("title")}
      </button>
      <div className="mt-2 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{client.name}</h1>
        <span className="rounded-full bg-brand-50 dark:bg-brand-500/15 px-3 py-1 text-xs font-medium text-brand-700 dark:text-brand-400">{t(client.stage)}</span>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400">{client.email ?? client.phone ?? "—"}</p>
      {client.estimatedValue != null && (
        <p className="mt-1 text-sm font-medium text-gray-700 dark:text-gray-200">
          {t("estimatedValue")}: {client.estimatedValue} {currency}
        </p>
      )}
      {client.owner && <p className="text-xs text-gray-400 dark:text-gray-500">{t("ownedBy", { name: client.owner.name })}</p>}
      {client.stage === "lost" && client.lostReason && (
        <p className="mt-1 text-xs text-error-600">
          {t("lostReason")}: {client.lostReason}
        </p>
      )}

      {losingStage ? (
        <div className="mt-4 flex max-w-md flex-col gap-2">
          <textarea
            rows={2}
            className="input"
            placeholder={t("lostReasonPlaceholder")}
            value={lostReasonDraft}
            onChange={(e) => setLostReasonDraft(e.target.value)}
          />
          <div className="flex gap-2">
            <button onClick={confirmLost} disabled={busy || !lostReasonDraft.trim()} className="btn-secondary px-3 py-1 text-xs">
              {t("confirmLoss")}
            </button>
            <button onClick={() => setLosingStage(false)} className="btn-secondary px-3 py-1 text-xs">
              {tc("cancel")}
            </button>
          </div>
        </div>
      ) : converting ? (
        <form onSubmit={submitConvert} className="mt-4 flex max-w-md flex-col gap-2">
          <input
            required
            className="input"
            placeholder={t("projectName")}
            value={convertForm.name}
            onChange={(e) => setConvertForm((f) => ({ ...f, name: e.target.value }))}
          />
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="btn-primary px-3 py-1 text-xs">
              {t("convertToProject")}
            </button>
            <button
              type="button"
              onClick={() => {
                setConverting(false);
                setConvertError(null);
              }}
              className="btn-secondary px-3 py-1 text-xs"
            >
              {tc("cancel")}
            </button>
          </div>
          {convertError && <p className="text-xs text-error-700 dark:text-error-500">{convertError}</p>}
        </form>
      ) : (
        <div className="mt-4 flex flex-wrap gap-1">
          {STAGES.filter((s) => s !== client.stage).map((s) => (
            <button key={s} onClick={() => moveStage(s)} disabled={busy} className="btn-secondary px-2 py-1 text-xs">
              → {t(s)}
            </button>
          ))}
          {client.stage === "won" && (
            <button onClick={startConvert} className="btn-primary px-2 py-1 text-xs">
              {t("convertToProject")}
            </button>
          )}
        </div>
      )}

      <ClientDealPanel clientId={clientId} currency={currency} isManager={!!isManager} onChanged={load} />

      <ClientBillingAddressPanel clientId={clientId} />

      <ClientTaxPanel clientId={clientId} />

      <CustomFieldsValuesPanel entityType="client" entityId={clientId} />

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <ClientActivityPanel clientId={clientId} />
        <ClientRemindersPanel clientId={clientId} />
      </div>
    </AuthenticatedShell>
  );
}
