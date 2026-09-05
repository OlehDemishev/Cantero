"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { getPortalToken, portalApiFetch } from "@/lib/portal-api-client";
import { ApiError, downloadBlob } from "@/lib/api-client";
import { formatDate } from "@/lib/format-date";

interface PortalInvoiceLine {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
}
interface PortalPayment {
  id: string;
  amount: string;
  method: string;
  paidAt: string;
}
interface PortalInstallment {
  id: string;
  label: string;
  amount: string;
  dueDate: string | null;
}
interface PortalInvoice {
  id: string;
  number: string;
  status: "draft" | "sent" | "paid" | "void";
  subtotal: string;
  taxAmount: string;
  total: string;
  dueDate: string | null;
  lines: PortalInvoiceLine[];
  payments: PortalPayment[];
  installments: PortalInstallment[];
  project: { name: string };
}

export default function PortalInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("portal");
  const ti = useTranslations("invoices");
  const router = useRouter();

  const [invoice, setInvoice] = useState<PortalInvoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [payBusy, setPayBusy] = useState(false);

  useEffect(() => {
    if (!getPortalToken()) {
      router.replace("/portal/login");
      return;
    }
    portalApiFetch<PortalInvoice>(`/portal/invoices/${id}`)
      .then(setInvoice)
      .catch((err) => setError(err instanceof ApiError ? err.message : t("verifyError")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function downloadPdf() {
    const blob = await portalApiFetch<Blob>(`/portal/invoices/${id}/pdf`);
    downloadBlob(blob, `${invoice?.number ?? "invoice"}.pdf`);
  }

  async function payNow(amount?: number) {
    setPayBusy(true);
    setError(null);
    try {
      const { url } = await portalApiFetch<{ url: string }>(`/portal/invoices/${id}/pay`, {
        method: "POST",
        body: JSON.stringify({ amount }),
      });
      window.location.href = url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("verifyError"));
      setPayBusy(false);
    }
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6 py-12">
        <p className="text-sm text-gray-500">{error}</p>
      </main>
    );
  }
  if (!invoice) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6 py-12">
        <p className="text-sm text-gray-500">{t("loading")}</p>
      </main>
    );
  }

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

  return (
    <main className="flex min-h-screen justify-center bg-gray-50 px-6 py-12">
      <div className="w-full max-w-2xl">
        <a href="/portal" className="mb-4 inline-block text-xs text-gray-500 hover:underline">
          ← {t("back")}
        </a>
        <div className="card">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold text-gray-900">{invoice.number}</h1>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                invoice.status === "paid" ? "bg-success-50 text-success-700" : "bg-gray-100 text-gray-600"
              }`}
            >
              {ti(invoice.status)}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">{invoice.project.name}</p>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[300px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2">{t("description")}</th>
                  <th>{ti("total")}</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lines.map((l) => (
                  <tr key={l.id} className="border-b border-gray-100">
                    <td className="py-2">{l.description}</td>
                    <td>{l.lineTotal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <dl className="mt-4 flex flex-col gap-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">{ti("total")}</dt>
              <dd className="font-semibold">{invoice.total}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">{ti("paidTotal")}</dt>
              <dd>{paidTotal}</dd>
            </div>
            <div className="flex justify-between border-t border-gray-200 pt-2 font-semibold">
              <dt>{ti("balanceDue")}</dt>
              <dd>{balanceDue}</dd>
            </div>
          </dl>

          {installmentRows.length > 0 && (
            <>
              <h2 className="mb-2 mt-6 text-sm font-semibold text-gray-700">{ti("paymentPlan")}</h2>
              <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] border-collapse text-sm">
                <tbody>
                  {installmentRows.map((inst) => (
                    <tr key={inst.id} className="border-b border-gray-100">
                      <td className="py-1.5">{inst.label}</td>
                      <td className="text-gray-500">{inst.dueDate ? formatDate(new Date(inst.dueDate)) : "—"}</td>
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
                          {inst.fulfilled ? ti("fulfilled") : inst.partial ? ti("partial") : ti("pending")}
                        </span>
                      </td>
                      <td className="text-right font-medium">{inst.amount}</td>
                      <td className="pl-2 text-right">
                        {!inst.fulfilled && invoice.status === "sent" && balanceDue > 0 && (
                          <button onClick={() => payNow(Number(inst.amount))} disabled={payBusy} className="btn-secondary px-2 py-1 text-xs">
                            {t("payThisInstallment")}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </>
          )}

          <div className="mt-6 flex flex-wrap gap-2">
            <button onClick={downloadPdf} className="btn-secondary">
              {ti("downloadPdf")}
            </button>
          </div>
        </div>

        {invoice.status === "sent" && balanceDue > 0 && (
          <div className="sticky bottom-0 mt-4 border-t border-gray-200 bg-gray-50 py-3">
            <button onClick={() => payNow()} disabled={payBusy} className="btn-primary w-full">
              {t("payNow")} ({balanceDue})
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
