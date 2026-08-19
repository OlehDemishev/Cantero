"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { apiFetch, downloadBlob } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";

interface Invoice {
  id: string;
  number: string;
  status: "draft" | "sent" | "paid" | "void";
  total: string;
  client: { name: string };
  project: { name: string };
}
interface ForecastBucket {
  bucket: string;
  inflow: number;
  outflow: number;
  net: number;
  runningBalance: number;
}
interface CashFlowForecast {
  series: ForecastBucket[];
}

function bucketLabel(bucket: string, locale: string): string {
  if (bucket === "overdue" || bucket === "unscheduled") return bucket;
  const [year, month] = bucket.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(locale, { month: "short", year: "numeric" });
}

export default function InvoicesPage() {
  const t = useTranslations("invoices");
  const tf = useTranslations("cashFlow");
  const tc = useTranslations("common");
  const { data: me } = useMe();
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [forecast, setForecast] = useState<CashFlowForecast | null>(null);
  const currency = me?.company.currency ?? "";
  const locale = me?.company.locale ?? "en";

  useEffect(() => {
    apiFetch<Invoice[]>("/invoices").then(setInvoices);
    apiFetch<CashFlowForecast>("/finance/cash-flow-forecast").then(setForecast);
  }, []);

  async function exportCsv() {
    const blob = await apiFetch<Blob>("/invoices/export.csv");
    downloadBlob(blob, "invoices.csv");
  }

  return (
    <AuthenticatedShell>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <button onClick={exportCsv} className="btn-secondary">
          {t("exportCsv")}
        </button>
      </div>

      <div className="mt-6">
        {!invoices ? (
          <p className="text-gray-500">{tc("loading")}</p>
        ) : invoices.length === 0 ? (
          <p className="text-gray-500">—</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-2">{t("number")}</th>
                <th>{tc("name")}</th>
                <th>{tc("status")}</th>
                <th>{t("total")}</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="cursor-pointer border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2">
                    <a href={`/invoices/${inv.id}`} className="block">
                      {inv.number}
                    </a>
                  </td>
                  <td>
                    {inv.client.name} · {inv.project.name}
                  </td>
                  <td>{t(inv.status)}</td>
                  <td>
                    {inv.total} {currency}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {forecast && (
        <div className="mt-10">
          <h2 className="mb-1 text-sm font-semibold text-gray-700">{tf("title")}</h2>
          <p className="mb-3 text-xs text-gray-500">{tf("hint")}</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2"></th>
                  <th className="text-right">{tf("inflow")}</th>
                  <th className="text-right">{tf("outflow")}</th>
                  <th className="text-right">{tf("net")}</th>
                  <th className="text-right">{tf("runningBalance")}</th>
                </tr>
              </thead>
              <tbody>
                {forecast.series.map((row) => (
                  <tr
                    key={row.bucket}
                    className={`border-b border-gray-100 ${row.bucket === "overdue" ? "bg-error-25" : ""}`}
                  >
                    <td className="py-1.5 font-medium capitalize">
                      {row.bucket === "overdue" ? tf("overdue") : row.bucket === "unscheduled" ? tf("unscheduled") : bucketLabel(row.bucket, locale)}
                    </td>
                    <td className="text-right text-success-700">
                      {row.inflow > 0 ? `+${row.inflow} ${currency}` : "—"}
                    </td>
                    <td className="text-right text-error-700">
                      {row.outflow > 0 ? `-${row.outflow} ${currency}` : "—"}
                    </td>
                    <td className={`text-right ${row.net < 0 ? "text-error-700" : "text-gray-700"}`}>
                      {row.net >= 0 ? "+" : ""}
                      {row.net} {currency}
                    </td>
                    <td
                      className={`text-right font-medium ${
                        row.bucket === "unscheduled" ? "text-gray-400" : row.runningBalance < 0 ? "text-error-700" : "text-gray-900"
                      }`}
                    >
                      {row.bucket === "unscheduled" ? "—" : `${row.runningBalance} ${currency}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AuthenticatedShell>
  );
}
