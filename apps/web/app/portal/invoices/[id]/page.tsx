"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { getPortalToken, portalApiFetch } from "@/lib/portal-api-client";
import { ApiError, downloadBlob } from "@/lib/api-client";

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
  project: { name: string };
}

export default function PortalInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("portal");
  const ti = useTranslations("invoices");
  const router = useRouter();

  const [invoice, setInvoice] = useState<PortalInvoice | null>(null);
  const [error, setError] = useState<string | null>(null);

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

          <table className="mt-6 w-full border-collapse text-sm">
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

          <button onClick={downloadPdf} className="btn-secondary mt-6">
            {ti("downloadPdf")}
          </button>
        </div>
      </div>
    </main>
  );
}
