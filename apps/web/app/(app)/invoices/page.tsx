"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  RECURRING_INVOICE_FREQUENCIES,
  type RecurringInvoiceFrequency,
} from "@cantero/shared";
import { EmptyState } from "@/components/ui/empty-state";
import { InvoicesIcon } from "@/components/nav-icons";
import { apiFetch, downloadBlob, getToken, API_URL, ApiError, notifyApiError } from "@/lib/api-client";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/lib/use-api";
import { useMe } from "@/lib/use-me";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { formatCurrency } from "@/lib/format-currency";
import { formatDate } from "@/lib/format-date";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Field, FormError } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";

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
const INVOICES_PAGE_SIZE = 100;
const RECURRING_INVOICES_PAGE_SIZE = 100;

export default function InvoicesPage() {
  const t = useTranslations("invoices");
  const confirm = useConfirm();
  const tc = useTranslations("common");
  const ta = useTranslations("a11y");
  const { data: me } = useMe();
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [invoicesError, setInvoicesError] = useState<Error | null>(null);
  const [invoicesHasMore, setInvoicesHasMore] = useState(false);
  const [invoicesLoadMoreBusy, setInvoicesLoadMoreBusy] = useState(false);
  const currency = me?.company.currency ?? "";

  const [recurring, setRecurring] = useState<RecurringInvoice[] | null>(null);
  const [recurringHasMore, setRecurringHasMore] = useState(false);
  const [recurringLoadMoreBusy, setRecurringLoadMoreBusy] = useState(false);
  const { data: projects = [] } = useApi<Project[]>("/projects");
  const { data: clients = [] } = useApi<Client[]>("/clients");
  const [recurringForm, setRecurringForm] = useState({
    projectId: "",
    clientId: "",
    name: "",
    frequency: "monthly" as RecurringInvoiceFrequency,
    taxPercent: "0",
    startDate: new Date().toISOString().slice(0, 10),
    endDate: "",
  });
  const [recurringLines, setRecurringLines] = useState<RecurringLineForm[]>([
    { description: "", quantity: "1", unitPrice: "0" },
  ]);
  const [recurringBusy, setRecurringBusy] = useState(false);
  const [recurringError, setRecurringError] = useState<string | null>(null);
  const [datevError, setDatevError] = useState<string | null>(null);
  const [datevWarningCount, setDatevWarningCount] = useState<number | null>(null);

  function loadRecurring() {
    apiFetch<RecurringInvoice[]>("/recurring-invoices")
      .then((page) => {
        setRecurring(page);
        setRecurringHasMore(page.length === RECURRING_INVOICES_PAGE_SIZE);
      })
      .catch(notifyApiError);
  }

  async function loadMoreRecurring() {
    if (!recurring || recurring.length === 0) return;
    setRecurringLoadMoreBusy(true);
    try {
      const page = await apiFetch<RecurringInvoice[]>(
        `/recurring-invoices?cursor=${recurring[recurring.length - 1].id}`,
      );
      setRecurring([...recurring, ...page]);
      setRecurringHasMore(page.length === RECURRING_INVOICES_PAGE_SIZE);
    } finally {
      setRecurringLoadMoreBusy(false);
    }
  }

  function loadInvoices() {
    apiFetch<Invoice[]>("/invoices")
      .then((page) => {
        setInvoicesError(null);
        setInvoices(page);
        setInvoicesHasMore(page.length === INVOICES_PAGE_SIZE);
      })
      .catch(setInvoicesError);
  }

  async function loadMoreInvoices() {
    if (!invoices || invoices.length === 0) return;
    setInvoicesLoadMoreBusy(true);
    try {
      const page = await apiFetch<Invoice[]>(
        `/invoices?cursor=${invoices[invoices.length - 1].id}`,
      );
      setInvoices([...invoices, ...page]);
      setInvoicesHasMore(page.length === INVOICES_PAGE_SIZE);
    } finally {
      setInvoicesLoadMoreBusy(false);
    }
  }

  useEffect(() => {
    loadInvoices();
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

  async function exportDatevCsv() {
    setDatevError(null);
    setDatevWarningCount(null);
    try {
      // A raw fetch, not apiFetch — the warning count travels as a response header, which
      // apiFetch's Blob-returning path doesn't expose.
      const token = getToken();
      const res = await fetch(`${API_URL}/invoices/export/datev.csv`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new ApiError(res.status, body?.message ?? res.statusText);
      }
      const warningsCount = Number(res.headers.get("X-Datev-Warnings-Count") ?? "0");
      const blob = await res.blob();
      downloadBlob(blob, "invoices-datev.csv");
      setDatevWarningCount(warningsCount);
    } catch (err) {
      setDatevError(err instanceof ApiError ? err.message : tc("error"));
    }
  }

  function updateRecurringLine(
    index: number,
    field: keyof RecurringLineForm,
    value: string,
  ) {
    setRecurringLines((lines) =>
      lines.map((l, i) => (i === index ? { ...l, [field]: value } : l)),
    );
  }

  function addRecurringLine() {
    setRecurringLines((lines) => [
      ...lines,
      { description: "", quantity: "1", unitPrice: "0" },
    ]);
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
          endDate: recurringForm.endDate
            ? new Date(recurringForm.endDate).toISOString()
            : undefined,
          lines: recurringLines.map((l) => ({
            description: l.description,
            quantity: Number(l.quantity),
            unitPrice: Number(l.unitPrice),
          })),
        }),
      });
      setRecurringForm((f) => ({
        ...f,
        name: "",
        projectId: "",
        clientId: "",
      }));
      setRecurringLines([{ description: "", quantity: "1", unitPrice: "0" }]);
      loadRecurring();
    } catch (err) {
      setRecurringError(err instanceof Error ? err.message : tc("error"));
    } finally {
      setRecurringBusy(false);
    }
  }

  async function toggleRecurringActive(item: RecurringInvoice) {
    await apiFetch(
      `/recurring-invoices/${item.id}/${item.active ? "pause" : "resume"}`,
      { method: "POST" },
    );
    loadRecurring();
  }

  async function generateRecurringNow(id: string) {
    setRecurringBusy(true);
    try {
      await apiFetch(`/recurring-invoices/${id}/generate-now`, {
        method: "POST",
      });
      loadRecurring();
      loadInvoices();
    } catch (err) {
      setRecurringError(err instanceof Error ? err.message : tc("error"));
    } finally {
      setRecurringBusy(false);
    }
  }

  async function deleteRecurring(id: string) {
    if (!(await confirm({ message: t("confirmDeleteRecurring"), tone: "danger", verb: "delete" }))) return;
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
    <>
      <PageHeader
        title={t("title")}
        actions={
          <>
            <button onClick={exportCsv} className="btn-secondary">
              {t("exportCsv")}
            </button>
            <button onClick={exportQuickBooksCsv} className="btn-secondary">
              {t("exportQuickBooks")}
            </button>
            <button onClick={exportXeroCsv} className="btn-secondary">
              {t("exportXero")}
            </button>
            <button onClick={exportDatevCsv} className="btn-secondary">
              {t("exportDatev")}
            </button>
          </>
        }
      />
      <p className="mt-1 text-xs text-fg-subtle">{t("datevTestImportNotice")}</p>
      {datevError && <FormError className="mt-1">{datevError}</FormError>}
      {datevWarningCount !== null && datevWarningCount > 0 && (
        <p className="mt-1 text-xs text-warning-fg">{t("datevWarningCount", { count: datevWarningCount })}</p>
      )}

      <div className="mt-6">
        {!invoices ? (
          invoicesError ? <ErrorState error={invoicesError} onRetry={loadInvoices} compact /> : <Skeleton variant="table" rows={5} columns={5} />
        ) : invoices.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={InvoicesIcon}
              title={t("emptyTitle")}
              message={t("empty")}
              cta={{ label: t("emptyCta"), href: "/projects" }}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-fg-subtle">
                  <th scope="col" className="py-2">{t("number")}</th>
                  <th scope="col">{tc("name")}</th>
                  <th scope="col">{tc("status")}</th>
                  <th scope="col">{t("total")}</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className="cursor-pointer border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-white/5"
                  >
                    <td className="py-2">
                      <a href={`/invoices/${inv.id}`} className="block">
                        {inv.number}
                      </a>
                    </td>
                    <td>
                      <Link
                        href={`/clients/${inv.client.id}`}
                        className="text-brand-700 dark:text-brand-400 hover:underline"
                      >
                        {inv.client.name}
                      </Link>{" "}
                      ·{" "}
                      <Link
                        href={`/projects/${inv.project.id}`}
                        className="text-brand-700 dark:text-brand-400 hover:underline"
                      >
                        {inv.project.name}
                      </Link>
                    </td>
                    <td>{t(inv.status)}</td>
                    <td>
                      {formatCurrency(inv.total, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {invoicesHasMore && (
              <button
                onClick={loadMoreInvoices}
                disabled={invoicesLoadMoreBusy}
                className="btn-secondary mt-3 px-2.5 py-1.5 text-xs"
              >
                {tc("loadMore")}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mt-10">
        <h2 className="mb-1 text-sm font-semibold text-fg-muted">
          {t("recurring")}
        </h2>
        <p className="mb-4 text-xs text-fg-subtle">
          {t("recurringHint")}
        </p>
        {recurringError && (
          <Alert tone="danger" className="mb-3">
            {recurringError}
          </Alert>
        )}

        {!recurring || recurring.length === 0 ? (
          <p className="mb-4 text-sm text-fg-subtle">
            {t("noRecurring")}
          </p>
        ) : (
          <div className="mb-6 flex flex-col gap-2">
            {recurring.map((r) => (
              <div
                key={r.id}
                className="rounded-lg border border-gray-200 dark:border-gray-700 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-sm font-medium text-fg">
                      {r.name}
                    </span>
                    <span className="ml-2 text-xs text-fg-subtle">
                      <Link
                        href={`/clients/${r.client.id}`}
                        className="text-brand-700 dark:text-brand-400 hover:underline"
                      >
                        {r.client.name}
                      </Link>{" "}
                      ·{" "}
                      <Link
                        href={`/projects/${r.project.id}`}
                        className="text-brand-700 dark:text-brand-400 hover:underline"
                      >
                        {r.project.name}
                      </Link>{" "}
                      · {t(`frequency_${r.frequency}`)}
                    </span>
                  </div>
                  <Badge tone={r.active ? "success" : "neutral"}>
                    {r.active ? t("active") : t("paused")}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-fg-subtle">
                  {t("nextRun")}:{" "}
                  {formatDate(r.nextRunDate)}
                  {r.lastGeneratedAt &&
                    ` · ${t("lastGenerated")}: ${formatDate(r.lastGeneratedAt)}`}
                  {r.endDate &&
                    ` · ${t("endDate")}: ${formatDate(r.endDate)}`}
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => generateRecurringNow(r.id)}
                    disabled={recurringBusy}
                    className="btn-secondary px-2 py-1 text-xs"
                  >
                    {t("generateNow")}
                  </button>
                  <button
                    onClick={() => toggleRecurringActive(r)}
                    className="btn-secondary px-2 py-1 text-xs"
                  >
                    {r.active ? t("pause") : t("resume")}
                  </button>
                  <button
                    onClick={() => deleteRecurring(r.id)}
                    className="btn-secondary px-2 py-1 text-xs"
                  >
                    {tc("delete")}
                  </button>
                  <label className="ml-auto flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={r.autopayEnabled}
                      onChange={() => toggleAutopay(r)}
                    />
                    {t("autopay")}
                  </label>
                </div>
              </div>
            ))}
            {recurringHasMore && (
              <button
                onClick={loadMoreRecurring}
                disabled={recurringLoadMoreBusy}
                className="btn-secondary self-start px-2.5 py-1.5 text-xs"
              >
                {tc("loadMore")}
              </button>
            )}
          </div>
        )}

        <form
          onSubmit={createRecurring}
          className="rounded-lg border border-gray-200 dark:border-gray-700 p-4"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input aria-label={tc("name")}
              required
              placeholder={t("recurringNamePlaceholder")}
              className="input"
              value={recurringForm.name}
              onChange={(e) =>
                setRecurringForm((f) => ({ ...f, name: e.target.value }))
              }
            />
            <select aria-label={ta("project")}
              required
              className="input"
              value={recurringForm.projectId}
              onChange={(e) =>
                setRecurringForm((f) => ({ ...f, projectId: e.target.value }))
              }
            >
              <option value="">{t("selectProject")}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select aria-label={ta("client")}
              required
              className="input"
              value={recurringForm.clientId}
              onChange={(e) =>
                setRecurringForm((f) => ({ ...f, clientId: e.target.value }))
              }
            >
              <option value="">{t("selectClient")}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select aria-label={ta("frequency")}
              className="input"
              value={recurringForm.frequency}
              onChange={(e) =>
                setRecurringForm((f) => ({
                  ...f,
                  frequency: e.target.value as RecurringInvoiceFrequency,
                }))
              }
            >
              {RECURRING_INVOICE_FREQUENCIES.map((freq) => (
                <option key={freq} value={freq}>
                  {t(`frequency_${freq}`)}
                </option>
              ))}
            </select>
            <Field label={t("startDate")} size="sm">
              <input
                required
                type="date"
                className="input"
                value={recurringForm.startDate}
                onChange={(e) =>
                  setRecurringForm((f) => ({ ...f, startDate: e.target.value }))
                }
              />
            </Field>
            <Field label={t("endDateOptional")} size="sm">
              <input
                type="date"
                className="input"
                value={recurringForm.endDate}
                onChange={(e) =>
                  setRecurringForm((f) => ({ ...f, endDate: e.target.value }))
                }
              />
            </Field>
            <Field label={t("taxPercent")} size="sm">
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                className="input"
                value={recurringForm.taxPercent}
                onChange={(e) =>
                  setRecurringForm((f) => ({
                    ...f,
                    taxPercent: e.target.value,
                  }))
                }
              />
            </Field>
          </div>

          <div className="mt-4 flex flex-col gap-2">
            {recurringLines.map((line, i) => (
              <div key={i} className="flex items-end gap-2">
                <input
                  required
                  placeholder={t("lineDescriptionPlaceholder")} aria-label={t("lineDescriptionPlaceholder")}
                  className="input flex-1"
                  value={line.description}
                  onChange={(e) =>
                    updateRecurringLine(i, "description", e.target.value)
                  }
                />
                <input
                  required
                  type="number"
                  step="0.01"
                  placeholder={t("quantity")} aria-label={t("quantity")}
                  className="input w-24"
                  value={line.quantity}
                  onChange={(e) =>
                    updateRecurringLine(i, "quantity", e.target.value)
                  }
                />
                <input
                  required
                  type="number"
                  step="0.01"
                  placeholder={t("unitPrice")} aria-label={t("unitPrice")}
                  className="input w-28"
                  value={line.unitPrice}
                  onChange={(e) =>
                    updateRecurringLine(i, "unitPrice", e.target.value)
                  }
                />
                {recurringLines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRecurringLine(i)}
                    className="btn-secondary shrink-0 px-2 py-1.5 text-xs"
                  >
                    {tc("delete")}
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={addRecurringLine}
              className="btn-secondary self-start px-3 py-1 text-xs"
            >
              {t("addLine")}
            </button>
          </div>

          <button
            type="submit"
            disabled={recurringBusy}
            className="btn-primary mt-4"
          >
            {t("createRecurring")}
          </button>
        </form>
      </div>

      <a href="/reports" className="card mt-10 block hover:border-gray-400">
        <div className="text-sm font-medium text-fg-muted">
          {t("cashFlowForecastLink")}
        </div>
        <div className="mt-1 text-fg">→</div>
      </a>
    </>
  );
}
