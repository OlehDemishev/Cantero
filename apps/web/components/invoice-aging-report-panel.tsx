"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";

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
  const tc = useTranslations("common");
  const [aging, setAging] = useState<InvoiceAging | null>(null);

  useEffect(() => {
    apiFetch<InvoiceAging>("/reports/invoice-aging").then(setAging);
  }, []);

  return (
    <>
      <h2 className="mb-3 mt-10 text-sm font-semibold text-gray-700">{t("invoiceAging")}</h2>
      {!aging ? (
        <p className="text-gray-500">{tc("loading")}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="card">
              <div className="text-xs text-gray-500">{t("totalOutstanding")}</div>
              <div className="mt-1 text-lg font-semibold">
                {aging.totalOutstanding} {currency}
              </div>
            </div>
            <div className="card">
              <div className="text-xs text-gray-500">{t("dso")}</div>
              <div className="mt-1 text-lg font-semibold">{aging.dso ?? "—"}</div>
            </div>
            <div className="card">
              <div className="text-xs text-gray-500">{t("bucketCurrent")}</div>
              <div className="mt-1 text-sm font-semibold">
                {aging.buckets.current} {currency}
              </div>
            </div>
            <div className="card">
              <div className="text-xs text-gray-500">{t("bucket1to30")}</div>
              <div className="mt-1 text-sm font-semibold">
                {aging.buckets.days1to30} {currency}
              </div>
            </div>
            <div className="card">
              <div className="text-xs text-gray-500">{t("bucket31to90")}</div>
              <div className="mt-1 text-sm font-semibold">
                {round2(aging.buckets.days31to60 + aging.buckets.days61to90)} {currency}
              </div>
            </div>
            <div className="card">
              <div className="text-xs text-gray-500">{t("bucket90plus")}</div>
              <div className="mt-1 text-sm font-semibold text-error-700">
                {aging.buckets.days90plus} {currency}
              </div>
            </div>
          </div>

          {aging.invoices.length === 0 ? (
            <p className="mt-4 text-sm text-gray-400">{t("noOutstanding")}</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-500">
                    <th className="py-2">{t("invoiceNumber")}</th>
                    <th>{t("client")}</th>
                    <th className="text-right">{t("outstanding")}</th>
                    <th className="text-right">{t("daysOverdue")}</th>
                  </tr>
                </thead>
                <tbody>
                  {aging.invoices.map((inv) => (
                    <tr key={inv.invoiceId} className="border-b border-gray-100">
                      <td className="py-2">
                        <a href={`/invoices/${inv.invoiceId}`} className="text-brand-700 hover:underline">
                          {inv.number}
                        </a>
                      </td>
                      <td>{inv.clientName}</td>
                      <td className="text-right">
                        {inv.outstanding} {currency}
                      </td>
                      <td className={`text-right ${inv.daysOverdue !== null && inv.daysOverdue > 0 ? "text-error-700" : ""}`}>
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
