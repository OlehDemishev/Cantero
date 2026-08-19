"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { DocumentsPanel } from "@/components/documents-panel";
import { apiFetch, downloadBlob } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";

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
  dueDate: string | null;
  lines: InvoiceLine[];
  payments: Payment[];
  installments: Installment[];
  client: { name: string };
  project: { id: string; name: string };
}

export function InvoiceDetail({ invoiceId }: { invoiceId: string }) {
  const t = useTranslations("invoices");
  const tc = useTranslations("common");
  const { data: me } = useMe();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [paymentForm, setPaymentForm] = useState({ amount: "", method: "bank_transfer" as (typeof PAYMENT_METHODS)[number] });
  const [dueDateInput, setDueDateInput] = useState("");
  const [installmentForm, setInstallmentForm] = useState({ label: "", amount: "", dueDate: "" });
  const [busy, setBusy] = useState(false);

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

  async function send() {
    setBusy(true);
    try {
      await apiFetch(`/invoices/${invoiceId}/send`, { method: "POST" });
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
        body: JSON.stringify({ amount: Number(paymentForm.amount), method: paymentForm.method }),
      });
      setPaymentForm({ amount: "", method: "bank_transfer" });
      load();
    } finally {
      setBusy(false);
    }
  }

  if (!invoice) {
    return (
      <AuthenticatedShell>
        <p className="text-gray-500">{tc("loading")}</p>
      </AuthenticatedShell>
    );
  }

  const currency = me?.company.currency ?? "";
  const paidTotal = invoice.payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const balanceDue = Number(invoice.total) - paidTotal;

  let cumulative = 0;
  const installmentRows = invoice.installments.map((inst) => {
    const from = cumulative;
    cumulative += Number(inst.amount);
    const fulfilled = paidTotal >= cumulative;
    const partial = !fulfilled && paidTotal > from;
    return { ...inst, fulfilled, partial };
  });

  const statusColor =
    invoice.status === "paid"
      ? "bg-green-100 text-green-800"
      : invoice.status === "sent"
        ? "bg-amber-100 text-amber-800"
        : invoice.status === "void"
          ? "bg-red-100 text-red-800"
          : "bg-gray-100 text-gray-600";

  return (
    <AuthenticatedShell>
      <a href={`/projects/${invoice.project.id}`} className="text-sm text-gray-500 hover:underline">
        ← {invoice.project.name}
      </a>
      <div className="mt-2 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{invoice.number}</h1>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusColor}`}>{t(invoice.status)}</span>
      </div>
      <p className="text-sm text-gray-500">{invoice.client.name}</p>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-2">{tc("name")}</th>
                <th>{tc("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((line) => (
                <tr key={line.id} className="border-b border-gray-100">
                  <td className="py-2">{line.description}</td>
                  <td>
                    {line.lineTotal} {currency}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2 className="mb-3 mt-8 text-sm font-semibold text-gray-700">{t("paymentPlan")}</h2>
          {installmentRows.length === 0 ? (
            <p className="text-sm text-gray-400">{t("noInstallments")}</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <tbody>
                {installmentRows.map((inst) => (
                  <tr key={inst.id} className="border-b border-gray-100">
                    <td className="py-1.5">{inst.label}</td>
                    <td className="text-gray-500">
                      {inst.dueDate ? new Date(inst.dueDate).toLocaleDateString() : "—"}
                    </td>
                    <td>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          inst.fulfilled
                            ? "bg-success-50 text-success-700"
                            : inst.partial
                              ? "bg-warning-50 text-warning-700"
                              : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {inst.fulfilled ? t("fulfilled") : inst.partial ? t("partial") : t("pending")}
                      </span>
                    </td>
                    <td className="text-right font-medium">
                      {inst.amount} {currency}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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

          <h2 className="mb-3 mt-8 text-sm font-semibold text-gray-700">{t("payments")}</h2>
          {invoice.payments.length === 0 ? (
            <p className="text-sm text-gray-400">{t("noPayments")}</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <tbody>
                {invoice.payments.map((p) => (
                  <tr key={p.id} className="border-b border-gray-100">
                    <td className="py-1">{new Date(p.paidAt).toLocaleDateString()}</td>
                    <td>{t(p.method as (typeof PAYMENT_METHODS)[number])}</td>
                    <td className="text-right">
                      {p.amount} {currency}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {(invoice.status === "sent" || invoice.status === "paid") && balanceDue > 0 && (
            <form onSubmit={recordPayment} className="mt-4 flex items-end gap-2">
              <input
                required
                type="number"
                step="0.01"
                placeholder={t("amount")}
                className="input w-32"
                value={paymentForm.amount}
                onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))}
              />
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
            </form>
          )}
        </div>

        <div className="card lg:col-span-1 h-fit">
          <dl className="flex flex-col gap-2 text-sm">
            <Row label={t("total")} value={`${invoice.total} ${currency}`} />
            <Row label={t("paidTotal")} value={`${paidTotal.toFixed(2)} ${currency}`} />
            <Row label={t("balanceDue")} value={`${balanceDue.toFixed(2)} ${currency}`} emphasize />
          </dl>

          <form onSubmit={saveDueDate} className="mt-4 flex items-end gap-2 border-t border-gray-100 pt-4">
            <label className="flex flex-1 flex-col gap-1 text-xs text-gray-500">
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
          </div>
        </div>
      </div>

      <DocumentsPanel invoiceId={invoice.id} />
    </AuthenticatedShell>
  );
}

function Row({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div className={`flex justify-between ${emphasize ? "border-t border-gray-200 pt-2 font-semibold" : ""}`}>
      <dt className="text-gray-500">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
