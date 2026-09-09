"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { RECURRING_INVOICE_FREQUENCIES, type RecurringInvoiceFrequency } from "@cantero/shared";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { apiFetch, downloadBlob } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";

interface Invoice {
  id: string;
  number: string;
  status: "draft" | "sent" | "paid" | "void";
  total: string;
  client: { id: string; name: string };
  project: { id: string; name: string };
}
interface Project {
  id: string;
  name: string;
}
interface Client {
  id: string;
  name: string;
}
interface RecurringInvoiceLine {
  description: string;
  quantity: string;
  unitPrice: string;
}
interface RecurringInvoice {
  id: string;
  name: string;
  frequency: RecurringInvoiceFrequency;
  taxPercent: string;
  active: boolean;
  autopayEnabled: boolean;
  startDate: string;
  nextRunDate: string;
  endDate: string | null;
  lastGeneratedAt: string | null;
  project: { id: string; name: string };
  client: { id: string; name: string };
  lines: RecurringInvoiceLine[];
}
interface RecurringLineForm {
  description: string;
  quantity: string;
  unitPrice: string;
}
export default function InvoicesPage() {
  const t = useTranslations("invoices");
  const tc = useTranslations("common");
  const { data: me } = useMe();
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const currency = me?.company.currency ?? "";
  const locale = me?.company.locale ?? "en";

  const [recurring, setRecurring] = useState<RecurringInvoice[] | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [recurringForm, setRecurringForm] = useState({
    projectId: "",
    clientId: "",
    name: "",
    frequency: "monthly" as RecurringInvoiceFrequency,
    taxPercent: "0",
    startDate: new Date().toISOString().slice(0, 10),
    endDate: "",
  });
  const [recurringLines, setRecurringLines] = useState<RecurringLineForm[]>([{ description: "", quantity: "1", unitPrice: "0" }]);
  const [recurringBusy, setRecurringBusy] = useState(false);
  const [recurringError, setRecurringError] = useState<string | null>(null);

  function loadRecurring() {
    apiFetch<RecurringInvoice[]>("/recurring-invoices").then(setRecurring);
  }

  useEffect(() => {
    apiFetch<Invoice[]>("/invoices").then(setInvoices);
    apiFetch<Project[]>("/projects").then(setProjects);
    apiFetch<Client[]>("/clients").then(setClients);
    loadRecurring();
  }, []);

  async function exportCsv() {
    const blob = await apiFetch<Blob>("/invoices/export.csv");
    downloadBlob(blob, "invoices.csv");
  }

  async function exportQuickBooksCsv() {
    const blob = await apiFetch<Blob>("/invoices/export/quickbooks.csv");
    downloadBlob(blob, "invoices-quickbooks.csv");
  }

  async function exportXeroCsv() {
    const blob = await apiFetch<Blob>("/invoices/export/xero.csv");
    downloadBlob(blob, "invoices-xero.csv");
  }

  function updateRecurringLine(index: number, field: keyof RecurringLineForm, value: string) {
    setRecurringLines((lines) => lines.map((l, i) => (i === index ? { ...l, [field]: value } : l)));
  }

  function addRecurringLine() {
    setRecurringLines((lines) => [...lines, { description: "", quantity: "1", unitPrice: "0" }]);
  }

  function removeRecurringLine(index: number) {
    setRecurringLines((lines) => lines.filter((_, i) => i !== index));
  }

  async function createRecurring(e: React.FormEvent) {
    e.preventDefault();
    setRecurringBusy(true);
    setRecurringError(null);
    try {
      await apiFetch("/recurring-invoices", {
        method: "POST",
        body: JSON.stringify({
          projectId: recurringForm.projectId,
          clientId: recurringForm.clientId,
          name: recurringForm.name,
          frequency: recurringForm.frequency,
          taxPercent: Number(recurringForm.taxPercent),
          startDate: new Date(recurringForm.startDate).toISOString(),
          endDate: recurringForm.endDate ? new Date(recurringForm.endDate).toISOString() : undefined,
          lines: recurringLines.map((l) => ({
            description: l.description,
            quantity: Number(l.quantity),
            unitPrice: Number(l.unitPrice),
          })),
        }),
      });
      setRecurringForm((f) => ({ ...f, name: "", projectId: "", clientId: "" }));
      setRecurringLines([{ description: "", quantity: "1", unitPrice: "0" }]);
      loadRecurring();
    } catch (err) {
      setRecurringError(err instanceof Error ? err.message : tc("error"));
    } finally {
      setRecurringBusy(false);
    }
  }

  async function toggleRecurringActive(item: RecurringInvoice) {
    await apiFetch(`/recurring-invoices/${item.id}/${item.active ? "pause" : "resume"}`, { method: "POST" });
    loadRecurring();
  }

  async function generateRecurringNow(id: string) {
    setRecurringBusy(true);
    try {
      await apiFetch(`/recurring-invoices/${id}/generate-now`, { method: "POST" });
      loadRecurring();
      apiFetch<Invoice[]>("/invoices").then(setInvoices);
    } catch (err) {
      setRecurringError(err instanceof Error ? err.message : tc("error"));
    } finally {
      setRecurringBusy(false);
    }
  }

  async function deleteRecurring(id: string) {
    if (!window.confirm(t("confirmDeleteRecurring"))) return;
    await apiFetch(`/recurring-invoices/${id}`, { method: "DELETE" });
    loadRecurring();
  }

  async function toggleAutopay(item: RecurringInvoice) {
    setRecurringError(null);
    try {
      await apiFetch(`/recurring-invoices/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ autopayEnabled: !item.autopayEnabled }),
      });
      loadRecurring();
    } catch (err) {
      setRecurringError(err instanceof Error ? err.message : tc("error"));
    }
  }

  return (
    <AuthenticatedShell>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <div className="flex gap-2">
          <button onClick={exportCsv} className="btn-secondary">
            {t("exportCsv")}
          </button>
          <button onClick={exportQuickBooksCsv} className="btn-secondary">
            {t("exportQuickBooks")}
          </button>
          <button onClick={exportXeroCsv} className="btn-secondary">
            {t("exportXero")}
          </button>
        </div>
      </div>

      <div className="mt-6">
        {!invoices ? (
          <p className="text-gray-500 dark:text-gray-400">{tc("loading")}</p>
        ) : invoices.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400">—</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                <th className="py-2">{t("number")}</th>
                <th>{tc("name")}</th>
                <th>{tc("status")}</th>
                <th>{t("total")}</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="cursor-pointer border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-white/5">
                  <td className="py-2">
                    <a href={`/invoices/${inv.id}`} className="block">
                      {inv.number}
                    </a>
                  </td>
                  <td>
                    <Link href={`/clients/${inv.client.id}`} className="text-brand-700 dark:text-brand-400 hover:underline">
                      {inv.client.name}
                    </Link>{" "}
                    ·{" "}
                    <Link href={`/projects/${inv.project.id}`} className="text-brand-700 dark:text-brand-400 hover:underline">
                      {inv.project.name}
                    </Link>
                  </td>
                  <td>{t(inv.status)}</td>
                  <td>
                    {inv.total} {currency}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <div className="mt-10">
        <h2 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("recurring")}</h2>
        <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">{t("recurringHint")}</p>
        {recurringError && <p className="mb-3 rounded-md bg-red-50 dark:bg-red-500/15 px-3 py-2 text-sm text-red-700 dark:text-red-400">{recurringError}</p>}

        {!recurring || recurring.length === 0 ? (
          <p className="mb-4 text-sm text-gray-400 dark:text-gray-500">{t("noRecurring")}</p>
        ) : (
          <div className="mb-6 flex flex-col gap-2">
            {recurring.map((r) => (
              <div key={r.id} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-50">{r.name}</span>
                    <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                      <Link href={`/clients/${r.client.id}`} className="text-brand-700 dark:text-brand-400 hover:underline">
                        {r.client.name}
                      </Link>{" "}
                      ·{" "}
                      <Link href={`/projects/${r.project.id}`} className="text-brand-700 dark:text-brand-400 hover:underline">
                        {r.project.name}
                      </Link>{" "}
                      · {t(`frequency_${r.frequency}`)}
                    </span>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.active ? "bg-success-50 dark:bg-success-500/15 text-success-700 dark:text-success-500" : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"}`}
                  >
                    {r.active ? t("active") : t("paused")}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                  {t("nextRun")}: {new Date(r.nextRunDate).toLocaleDateString(locale)}
                  {r.lastGeneratedAt && ` · ${t("lastGenerated")}: ${new Date(r.lastGeneratedAt).toLocaleDateString(locale)}`}
                  {r.endDate && ` · ${t("endDate")}: ${new Date(r.endDate).toLocaleDateString(locale)}`}
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => generateRecurringNow(r.id)}
                    disabled={recurringBusy}
                    className="btn-secondary px-2 py-1 text-xs"
                  >
                    {t("generateNow")}
                  </button>
                  <button onClick={() => toggleRecurringActive(r)} className="btn-secondary px-2 py-1 text-xs">
                    {r.active ? t("pause") : t("resume")}
                  </button>
                  <button onClick={() => deleteRecurring(r.id)} className="btn-secondary px-2 py-1 text-xs">
                    {tc("delete")}
                  </button>
                  <label className="ml-auto flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                    <input type="checkbox" checked={r.autopayEnabled} onChange={() => toggleAutopay(r)} />
                    {t("autopay")}
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={createRecurring} className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              required
              placeholder={t("recurringNamePlaceholder")}
              className="input"
              value={recurringForm.name}
              onChange={(e) => setRecurringForm((f) => ({ ...f, name: e.target.value }))}
            />
            <select
              required
              className="input"
              value={recurringForm.projectId}
              onChange={(e) => setRecurringForm((f) => ({ ...f, projectId: e.target.value }))}
            >
              <option value="">{t("selectProject")}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              required
              className="input"
              value={recurringForm.clientId}
              onChange={(e) => setRecurringForm((f) => ({ ...f, clientId: e.target.value }))}
            >
              <option value="">{t("selectClient")}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              className="input"
              value={recurringForm.frequency}
              onChange={(e) => setRecurringForm((f) => ({ ...f, frequency: e.target.value as RecurringInvoiceFrequency }))}
            >
              {RECURRING_INVOICE_FREQUENCIES.map((freq) => (
                <option key={freq} value={freq}>
                  {t(`frequency_${freq}`)}
                </option>
              ))}
            </select>
            <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
              {t("startDate")}
              <input
                required
                type="date"
                className="input"
                value={recurringForm.startDate}
                onChange={(e) => setRecurringForm((f) => ({ ...f, startDate: e.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
              {t("endDateOptional")}
              <input
                type="date"
                className="input"
                value={recurringForm.endDate}
                onChange={(e) => setRecurringForm((f) => ({ ...f, endDate: e.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
              {t("taxPercent")}
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                className="input"
                value={recurringForm.taxPercent}
                onChange={(e) => setRecurringForm((f) => ({ ...f, taxPercent: e.target.value }))}
              />
            </label>
          </div>

          <div className="mt-4 flex flex-col gap-2">
            {recurringLines.map((line, i) => (
              <div key={i} className="flex items-end gap-2">
                <input
                  required
                  placeholder={t("lineDescriptionPlaceholder")}
                  className="input flex-1"
                  value={line.description}
                  onChange={(e) => updateRecurringLine(i, "description", e.target.value)}
                />
                <input
                  required
                  type="number"
                  step="0.01"
                  placeholder={t("quantity")}
                  className="input w-24"
                  value={line.quantity}
                  onChange={(e) => updateRecurringLine(i, "quantity", e.target.value)}
                />
                <input
                  required
                  type="number"
                  step="0.01"
                  placeholder={t("unitPrice")}
                  className="input w-28"
                  value={line.unitPrice}
                  onChange={(e) => updateRecurringLine(i, "unitPrice", e.target.value)}
                />
                {recurringLines.length > 1 && (
                  <button type="button" onClick={() => removeRecurringLine(i)} className="btn-secondary shrink-0 px-2 py-1.5 text-xs">
                    {tc("delete")}
                  </button>
                )}
              </div>
            ))}
            <button type="button" onClick={addRecurringLine} className="btn-secondary self-start px-3 py-1 text-xs">
              {t("addLine")}
            </button>
          </div>

          <button type="submit" disabled={recurringBusy} className="btn-primary mt-4">
            {t("createRecurring")}
          </button>
        </form>
      </div>

      <a href="/reports" className="card mt-10 block hover:border-gray-400">
        <div className="text-sm font-medium text-gray-700 dark:text-gray-200">{t("cashFlowForecastLink")}</div>
        <div className="mt-1 text-gray-900 dark:text-gray-50">→</div>
      </a>
    </AuthenticatedShell>
  );
}
