"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { getPortalToken, portalApiFetch } from "@/lib/portal-api-client";
import { ApiError, downloadBlob } from "@/lib/api-client";
import { formatDate } from "@/lib/format-date";
import { PublicLinkError } from "@/components/public-link-error";

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
  onlinePaymentsEnabled: boolean;
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
  const tp = useTranslations("publicLink");
  const ti = useTranslations("invoices");
  const router = useRouter();

  const [invoice, setInvoice] = useState<PortalInvoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [payBusy, setPayBusy] = useState(false);

  useEffect(() => {
    if (!getPortalToken()) {
      router.replace("/portal/login");
      return;
    }
    portalApiFetch<PortalInvoice>(`/portal/invoices/${id}`)
      .then(setInvoice)
      .catch(setLoadError);
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

  if (loadError) {
    return (
      <PublicLinkError
        error={loadError}
        action={
          <a href="/portal" className="btn-primary inline-block">
            {tp("backToPortal")}
          </a>
        }
      />
    );
  }
  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-700 px-6 py-12">
        <p className="text-sm text-fg-subtle">{error}</p>
      </main>
    );
  }
  if (!invoice) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-700 px-6 py-12">
        <p className="text-sm text-fg-subtle">{t("loading")}</p>
      </main>
    );
  }

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

  return (
    <main className="flex min-h-screen justify-center bg-gray-50 dark:bg-gray-700 px-6 py-12">
      <div className="w-full max-w-2xl">
        <a href="/portal" className="mb-4 inline-block text-xs text-fg-subtle hover:underline">
          ← {t("back")}
        </a>
        <div className="card">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold text-fg">{invoice.number}</h1>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                invoice.status === "paid" ? "bg-success-50 dark:bg-success-500/15 text-success-fg" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
              }`}
            >
              {ti(invoice.status)}
            </span>
          </div>
          <p className="mt-1 text-sm text-fg-subtle">{invoice.project.name}</p>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[300px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-fg-subtle">
                  <th className="py-2">{t("description")}</th>
                  <th>{ti("total")}</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lines.map((l) => (
                  <tr key={l.id} className="border-b border-gray-100 dark:border-gray-700">
                    <td className="py-2">{l.description}</td>
                    <td>{l.lineTotal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <dl className="mt-4 flex flex-col gap-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-fg-subtle">{ti("total")}</dt>
              <dd className="font-semibold">{invoice.total}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-fg-subtle">{ti("paidTotal")}</dt>
              <dd>{paidTotal}</dd>
            </div>
            <div className="flex justify-between border-t border-gray-200 dark:border-gray-700 pt-2 font-semibold">
              <dt>{ti("balanceDue")}</dt>
              <dd>{balanceDue}</dd>
            </div>
          </dl>

          {installmentRows.length > 0 && (
            <>
              <h2 className="mb-2 mt-6 text-sm font-semibold text-fg-muted">{ti("paymentPlan")}</h2>
              <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] border-collapse text-sm">
                <tbody>
                  {installmentRows.map((inst) => (
                    <tr key={inst.id} className="border-b border-gray-100 dark:border-gray-700">
                      <td className="py-1.5">{inst.label}</td>
                      <td className="text-fg-subtle">{inst.dueDate ? formatDate(new Date(inst.dueDate)) : "—"}</td>
                      <td>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            inst.fulfilled
                              ? "bg-success-50 dark:bg-success-500/15 text-success-fg"
                              : inst.partial
                                ? "bg-warning-50 dark:bg-warning-500/15 text-warning-fg"
                                : "bg-gray-100 dark:bg-gray-700 text-fg-subtle"
                          }`}
                        >
                          {inst.fulfilled ? ti("fulfilled") : inst.partial ? ti("partial") : ti("pending")}
                        </span>
                      </td>
                      <td className="text-right font-medium">{inst.amount}</td>
                      <td className="pl-2 text-right">
                        {!inst.fulfilled && invoice.onlinePaymentsEnabled && invoice.status === "sent" && balanceDue > 0 && (
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

        {invoice.onlinePaymentsEnabled && invoice.status === "sent" && balanceDue > 0 && (
          <div className="sticky bottom-0 mt-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 py-3">
            <button onClick={() => payNow()} disabled={payBusy} className="btn-primary w-full">
              {t("payNow")} ({balanceDue})
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
