"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { SUPPORTED_CURRENCIES } from "@cantero/shared";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { DocumentsPanel } from "@/components/documents-panel";
import { apiFetch, downloadBlob, ApiError } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";
import { formatCurrency } from "@/lib/format-currency";
import { formatDate } from "@/lib/format-date";

const PAYMENT_METHODS = ["bank_transfer", "card", "cash", "other"] as const;

interface InvoiceLine {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
}
interface Payment {
  id: string;
  amount: string;
  method: string;
  paidAt: string;
  currency: string | null;
  foreignAmount: string | null;
  exchangeRate: string | null;
  fxGainLoss: string | null;
}
interface Installment {
  id: string;
  label: string;
  amount: string;
  dueDate: string | null;
}
interface Invoice {
  id: string;
  number: string;
  status: "draft" | "sent" | "paid" | "void";
  subtotal: string;
  taxAmount: string;
  total: string;
  currency: string;
  dueDate: string | null;
  percentComplete: string | null;
  isRetainageRelease: boolean;
  lateFeeAccrued: number;
  lines: InvoiceLine[];
  payments: Payment[];
  installments: Installment[];
  client: { id: string; name: string };
  project: { id: string; name: string };
}

export function InvoiceDetail({ invoiceId }: { invoiceId: string }) {
  const t = useTranslations("invoices");
  const tc = useTranslations("common");
  const { data: me } = useMe();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [paymentForm, setPaymentForm] = useState({ amount: "", method: "bank_transfer" as (typeof PAYMENT_METHODS)[number] });
  const [foreignPayment, setForeignPayment] = useState(false);
  const [foreignPaymentForm, setForeignPaymentForm] = useState<{
    currency: (typeof SUPPORTED_CURRENCIES)[number];
    foreignAmount: string;
    exchangeRate: string;
  }>({
    currency: SUPPORTED_CURRENCIES[0],
    foreignAmount: "",
    exchangeRate: "",
  });
  const [dueDateInput, setDueDateInput] = useState("");
  const [installmentForm, setInstallmentForm] = useState({ label: "", amount: "", dueDate: "" });
  const [busy, setBusy] = useState(false);
  const [emailSentTo, setEmailSentTo] = useState<string | null | undefined>(undefined);
  const [eInvoiceError, setEInvoiceError] = useState<string | null>(null);

  function load() {
    apiFetch<Invoice>(`/invoices/${invoiceId}`).then((inv) => {
      setInvoice(inv);
      setDueDateInput(inv.dueDate ? inv.dueDate.slice(0, 10) : "");
    });
  }

  useEffect(load, [invoiceId]);

  async function downloadPdf() {
    const blob = await apiFetch<Blob>(`/invoices/${invoiceId}/pdf`);
    downloadBlob(blob, `${invoice?.number ?? "invoice"}.pdf`);
  }

  async function downloadScheduleOfValues() {
    const blob = await apiFetch<Blob>(`/invoices/${invoiceId}/schedule-of-values-pdf`);
    downloadBlob(blob, `${invoice?.number ?? "invoice"}-schedule-of-values.pdf`);
  }

  async function downloadEInvoice() {
    setEInvoiceError(null);
    try {
      const blob = await apiFetch<Blob>(`/invoices/${invoiceId}/e-invoice.xml`);
      downloadBlob(blob, `${invoice?.number ?? "invoice"}-xrechnung.xml`);
    } catch (err) {
      setEInvoiceError(err instanceof ApiError ? err.message : tc("error"));
    }
  }

  async function send() {
    setBusy(true);
    try {
      const result = await apiFetch<{ emailSentTo: string | null }>(`/invoices/${invoiceId}/send`, { method: "POST" });
      setEmailSentTo(result.emailSentTo);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function chargeLateFee() {
    setBusy(true);
    try {
      await apiFetch(`/invoices/${invoiceId}/charge-late-fee`, { method: "POST" });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function saveDueDate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/invoices/${invoiceId}`, {
        method: "PATCH",
        body: JSON.stringify({ dueDate: dueDateInput ? new Date(dueDateInput).toISOString() : null }),
      });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function addInstallment(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/invoices/${invoiceId}/installments`, {
        method: "POST",
        body: JSON.stringify({
          label: installmentForm.label,
          amount: Number(installmentForm.amount),
          dueDate: installmentForm.dueDate ? new Date(installmentForm.dueDate).toISOString() : undefined,
        }),
      });
      setInstallmentForm({ label: "", amount: "", dueDate: "" });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function recordPayment(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/invoices/${invoiceId}/payments`, {
        method: "POST",
        body: JSON.stringify(
          foreignPayment
            ? {
                method: paymentForm.method,
                foreignPayment: {
                  currency: foreignPaymentForm.currency,
                  foreignAmount: Number(foreignPaymentForm.foreignAmount),
                  exchangeRate: Number(foreignPaymentForm.exchangeRate),
                },
              }
            : { amount: Number(paymentForm.amount), method: paymentForm.method },
        ),
      });
      setPaymentForm({ amount: "", method: "bank_transfer" });
      setForeignPaymentForm({ currency: SUPPORTED_CURRENCIES[0], foreignAmount: "", exchangeRate: "" });
      setForeignPayment(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function recalculateTax() {
    setBusy(true);
    try {
      await apiFetch(`/invoices/${invoiceId}/recalculate-tax`, { method: "POST" });
      load();
    } finally {
      setBusy(false);
    }
  }

  if (!invoice) {
    return (
      <AuthenticatedShell>
        <p className="text-gray-500 dark:text-gray-400">{tc("loading")}</p>
      </AuthenticatedShell>
    );
  }

  const currency = invoice.currency ?? me?.company.currency ?? "";
  const locale = me?.company.locale;
  const money = (amount: number | string | null | undefined) => formatCurrency(amount, currency, locale);
  const paidTotal = invoice.payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const balanceDue = Number(invoice.total) - paidTotal;

  const installmentRows = invoice.installments.reduce(
    (acc, inst) => {
      const from = acc.cumulative;
      const cumulative = from + Number(inst.amount);
      const fulfilled = paidTotal >= cumulative;
      const partial = !fulfilled && paidTotal > from;
      return { rows: [...acc.rows, { ...inst, fulfilled, partial }], cumulative };
    },
    { rows: [] as ((typeof invoice.installments)[number] & { fulfilled: boolean; partial: boolean })[], cumulative: 0 },
  ).rows;

  const statusColor =
    invoice.status === "paid"
      ? "bg-green-100 dark:bg-green-500/15 text-green-800 dark:text-green-400"
      : invoice.status === "sent"
        ? "bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-400"
        : invoice.status === "void"
          ? "bg-red-100 dark:bg-red-500/15 text-red-800 dark:text-red-400"
          : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300";

  return (
    <AuthenticatedShell>
      <a href={`/projects/${invoice.project.id}`} className="text-sm text-gray-500 dark:text-gray-400 hover:underline">
        ← {invoice.project.name}
      </a>
      <div className="mt-2 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{invoice.number}</h1>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusColor}`}>{t(invoice.status)}</span>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        <Link href={`/clients/${invoice.client.id}`} className="hover:underline">
          {invoice.client.name}
        </Link>
      </p>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                <th className="py-2">{tc("name")}</th>
                <th>{tc("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((line) => (
                <tr key={line.id} className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-2">{line.description}</td>
                  <td>{money(line.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          <h2 className="mb-3 mt-8 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("paymentPlan")}</h2>
          {installmentRows.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">{t("noInstallments")}</p>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <tbody>
                {installmentRows.map((inst) => (
                  <tr key={inst.id} className="border-b border-gray-100 dark:border-gray-700">
                    <td className="py-1.5">{inst.label}</td>
                    <td className="text-gray-500 dark:text-gray-400">
                      {inst.dueDate ? formatDate(new Date(inst.dueDate)) : "—"}
                    </td>
                    <td>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          inst.fulfilled
                            ? "bg-success-50 dark:bg-success-500/15 text-success-700 dark:text-success-500"
                            : inst.partial
                              ? "bg-warning-50 dark:bg-warning-500/15 text-warning-700 dark:text-warning-500"
                              : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                        }`}
                      >
                        {inst.fulfilled ? t("fulfilled") : inst.partial ? t("partial") : t("pending")}
                      </span>
                    </td>
                    <td className="text-right font-medium">{money(inst.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
          {invoice.status !== "void" && (
            <form onSubmit={addInstallment} className="mt-3 flex flex-wrap items-end gap-2">
              <input
                required
                placeholder={t("installmentLabel")}
                className="input w-auto"
                value={installmentForm.label}
                onChange={(e) => setInstallmentForm((f) => ({ ...f, label: e.target.value }))}
              />
              <input
                required
                type="number"
                step="0.01"
                placeholder={t("amount")}
                className="input w-28"
                value={installmentForm.amount}
                onChange={(e) => setInstallmentForm((f) => ({ ...f, amount: e.target.value }))}
              />
              <input
                type="date"
                className="input w-auto"
                value={installmentForm.dueDate}
                onChange={(e) => setInstallmentForm((f) => ({ ...f, dueDate: e.target.value }))}
              />
              <button type="submit" disabled={busy} className="btn-secondary">
                {t("addInstallment")}
              </button>
            </form>
          )}

          <h2 className="mb-3 mt-8 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("payments")}</h2>
          {invoice.payments.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">{t("noPayments")}</p>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <tbody>
                {invoice.payments.map((p) => (
                  <tr key={p.id} className="border-b border-gray-100 dark:border-gray-700">
                    <td className="py-1">{formatDate(new Date(p.paidAt))}</td>
                    <td>{t(p.method as (typeof PAYMENT_METHODS)[number])}</td>
                    <td className="text-right">
                      {money(p.amount)}
                      {p.currency && (
                        <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500">
                          ({p.foreignAmount} {p.currency} @ {p.exchangeRate})
                        </span>
                      )}
                    </td>
                    {p.fxGainLoss !== null && (
                      <td className={`pl-2 text-right text-xs font-medium ${Number(p.fxGainLoss) < 0 ? "text-error-600" : "text-success-700 dark:text-success-500"}`}>
                        {t("fxGainLoss")}: {Number(p.fxGainLoss) > 0 ? "+" : ""}
                        {money(p.fxGainLoss)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}

          {(invoice.status === "sent" || invoice.status === "paid") && balanceDue > 0 && (
            <form onSubmit={recordPayment} className="mt-4 flex flex-col gap-2">
              <div className="flex flex-wrap items-end gap-2">
                {!foreignPayment && (
                  <input
                    required
                    type="number"
                    step="0.01"
                    placeholder={t("amount")}
                    className="input w-32"
                    value={paymentForm.amount}
                    onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))}
                  />
                )}
                <select
                  className="input w-auto"
                  value={paymentForm.method}
                  onChange={(e) => setPaymentForm((f) => ({ ...f, method: e.target.value as (typeof PAYMENT_METHODS)[number] }))}
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {t(m)}
                    </option>
                  ))}
                </select>
                <button type="submit" disabled={busy} className="btn-secondary">
                  {t("recordPayment")}
                </button>
              </div>
              <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                <input type="checkbox" checked={foreignPayment} onChange={(e) => setForeignPayment(e.target.checked)} />
                {t("paidInForeignCurrency")}
              </label>
              {foreignPayment && (
                <div className="flex flex-wrap items-end gap-2">
                  <select
                    className="input w-auto"
                    value={foreignPaymentForm.currency}
                    onChange={(e) => setForeignPaymentForm((f) => ({ ...f, currency: e.target.value as (typeof SUPPORTED_CURRENCIES)[number] }))}
                  >
                    {SUPPORTED_CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <input
                    required
                    type="number"
                    step="0.01"
                    placeholder={t("foreignAmount")}
                    className="input w-32"
                    value={foreignPaymentForm.foreignAmount}
                    onChange={(e) => setForeignPaymentForm((f) => ({ ...f, foreignAmount: e.target.value }))}
                  />
                  <input
                    required
                    type="number"
                    step="0.000001"
                    placeholder={t("exchangeRateUsed")}
                    className="input w-32"
                    value={foreignPaymentForm.exchangeRate}
                    onChange={(e) => setForeignPaymentForm((f) => ({ ...f, exchangeRate: e.target.value }))}
                  />
                </div>
              )}
            </form>
          )}
        </div>

        <div className="card lg:col-span-1 h-fit">
          <dl className="flex flex-col gap-2 text-sm">
            <Row label={t("taxAmount")} value={money(invoice.taxAmount)} />
            <Row label={t("total")} value={money(invoice.total)} />
            <Row label={t("paidTotal")} value={money(paidTotal)} />
            <Row label={t("balanceDue")} value={money(balanceDue)} emphasize />
          </dl>

          {invoice.status === "draft" && invoice.percentComplete == null && !invoice.isRetainageRelease && (
            <button onClick={recalculateTax} disabled={busy} className="btn-secondary mt-3 w-full">
              {t("recalculateTax")}
            </button>
          )}

          {invoice.lateFeeAccrued > 0 && (
            <div className="mt-3 flex items-center justify-between rounded-lg border border-warning-200 bg-warning-50 dark:bg-warning-500/15 px-3 py-2">
              <span className="text-xs text-warning-700 dark:text-warning-500">
                {t("lateFeeAccrued", { amount: invoice.lateFeeAccrued, currency })}
              </span>
              <button onClick={chargeLateFee} disabled={busy} className="btn-secondary px-2 py-1 text-xs">
                {t("chargeLateFee")}
              </button>
            </div>
          )}

          <form onSubmit={saveDueDate} className="mt-4 flex items-end gap-2 border-t border-gray-100 dark:border-gray-700 pt-4">
            <label className="flex flex-1 flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
              {t("dueDate")}
              <input
                type="date"
                className="input"
                value={dueDateInput}
                onChange={(e) => setDueDateInput(e.target.value)}
              />
            </label>
            <button type="submit" disabled={busy} className="btn-secondary shrink-0">
              {tc("save")}
            </button>
          </form>

          <div className="mt-6 flex flex-col gap-2">
            {invoice.status === "draft" && (
              <button onClick={send} disabled={busy} className="btn-primary">
                {t("send")}
              </button>
            )}
            <button onClick={downloadPdf} className="btn-secondary">
              {t("downloadPdf")}
            </button>
            {invoice.percentComplete != null && (
              <button onClick={downloadScheduleOfValues} className="btn-secondary">
                {t("downloadScheduleOfValues")}
              </button>
            )}
            <button onClick={downloadEInvoice} className="btn-secondary">
              {t("downloadEInvoice")}
            </button>
            {eInvoiceError && <p className="text-xs text-error-600">{eInvoiceError}</p>}
            {emailSentTo !== undefined && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {emailSentTo ? tc("emailedTo", { email: emailSentTo }) : tc("noClientEmail")}
              </p>
            )}
          </div>
        </div>
      </div>

      <DocumentsPanel invoiceId={invoice.id} />
    </AuthenticatedShell>
  );
}

function Row({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div className={`flex justify-between ${emphasize ? "border-t border-gray-200 dark:border-gray-700 pt-2 font-semibold" : ""}`}>
      <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
