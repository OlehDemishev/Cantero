"use client";

import { useTranslations } from "next-intl";
import { useApi } from "@/lib/use-api";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/format-currency";

interface AgingInvoice {
  invoiceId: string;
  number: string;
  clientName: string;
  total: number;
  outstanding: number;
  daysOverdue: number | null;
}
interface InvoiceAging {
  totalOutstanding: number;
  dso: number | null;
  buckets: { current: number; days1to30: number; days31to60: number; days61to90: number; days90plus: number };
  invoices: AgingInvoice[];
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function InvoiceAgingReportPanel({ currency }: { currency: string }) {
  const t = useTranslations("reports");
  const { data: aging = null, error: agingError, reload: reloadAging } = useApi<InvoiceAging>("/reports/invoice-aging");

  return (
    <>
      <h2 className="mb-3 mt-10 text-sm font-semibold text-fg-muted">{t("invoiceAging")}</h2>
      {!aging ? (
        agingError ? <ErrorState error={agingError} onRetry={reloadAging} compact /> : <Skeleton lines={3} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="card">
              <div className="text-xs text-fg-subtle">{t("totalOutstanding")}</div>
              <div className="mt-1 text-lg font-semibold">
                {formatCurrency(aging.totalOutstanding, currency)}
              </div>
            </div>
            <div className="card">
              <div className="text-xs text-fg-subtle">{t("dso")}</div>
              <div className="mt-1 text-lg font-semibold">{aging.dso ?? "—"}</div>
            </div>
            <div className="card">
              <div className="text-xs text-fg-subtle">{t("bucketCurrent")}</div>
              <div className="mt-1 text-sm font-semibold">
                {formatCurrency(aging.buckets.current, currency)}
              </div>
            </div>
            <div className="card">
              <div className="text-xs text-fg-subtle">{t("bucket1to30")}</div>
              <div className="mt-1 text-sm font-semibold">
                {formatCurrency(aging.buckets.days1to30, currency)}
              </div>
            </div>
            <div className="card">
              <div className="text-xs text-fg-subtle">{t("bucket31to90")}</div>
              <div className="mt-1 text-sm font-semibold">
                {formatCurrency(round2(aging.buckets.days31to60 + aging.buckets.days61to90), currency)}
              </div>
            </div>
            <div className="card">
              <div className="text-xs text-fg-subtle">{t("bucket90plus")}</div>
              <div className="mt-1 text-sm font-semibold text-danger-fg">
                {formatCurrency(aging.buckets.days90plus, currency)}
              </div>
            </div>
          </div>

          {aging.invoices.length === 0 ? (
            <p className="mt-4 text-sm text-fg-subtle">{t("noOutstanding")}</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-fg-subtle">
                    <th scope="col" className="py-2">{t("invoiceNumber")}</th>
                    <th scope="col">{t("client")}</th>
                    <th scope="col" className="text-right">{t("outstanding")}</th>
                    <th scope="col" className="text-right">{t("daysOverdue")}</th>
                  </tr>
                </thead>
                <tbody>
                  {aging.invoices.map((inv) => (
                    <tr key={inv.invoiceId} className="border-b border-gray-100 dark:border-gray-700">
                      <td className="py-2">
                        <a href={`/invoices/${inv.invoiceId}`} className="text-brand-700 dark:text-brand-400 hover:underline">
                          {inv.number}
                        </a>
                      </td>
                      <td>{inv.clientName}</td>
                      <td className="text-right">
                        {formatCurrency(inv.outstanding, currency)}
                      </td>
                      <td className={`text-right ${inv.daysOverdue !== null && inv.daysOverdue > 0 ? "text-danger-fg" : ""}`}>
                        {inv.daysOverdue !== null && inv.daysOverdue > 0 ? inv.daysOverdue : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
