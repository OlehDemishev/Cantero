"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";

interface Invoice {
  id: string;
  number: string;
  status: "draft" | "sent" | "paid" | "void";
  total: string;
  client: { name: string };
  project: { name: string };
}

export default function InvoicesPage() {
  const t = useTranslations("invoices");
  const tc = useTranslations("common");
  const { data: me } = useMe();
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);

  useEffect(() => {
    apiFetch<Invoice[]>("/invoices").then(setInvoices);
  }, []);

  return (
    <AuthenticatedShell>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

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
                    {inv.total} {me?.company.currency}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AuthenticatedShell>
  );
}
