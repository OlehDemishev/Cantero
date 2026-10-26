"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMe } from "@/lib/use-me";
import { InvoicesHeader } from "@/components/invoices-page/invoices-header";
import { InvoiceList } from "@/components/invoices-page/invoice-list";
import { RecurringInvoices } from "@/components/invoices-page/recurring-invoices";

/** Invoices: the exports, the invoice list and recurring invoices (components/invoices-page/*). */
export default function InvoicesPage() {
  const t = useTranslations("invoices");
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "";
  // Bumped when a recurring invoice generates one now, so the list loads again.
  const [invoicesVersion, setInvoicesVersion] = useState(0);

  return (
    <>
      <InvoicesHeader />

      <InvoiceList currency={currency} version={invoicesVersion} />

      <RecurringInvoices onInvoicesChanged={() => setInvoicesVersion((v) => v + 1)} />

      <a href="/reports" className="card mt-10 block hover:border-gray-400">
        <div className="text-sm font-medium text-fg-muted">
          {t("cashFlowForecastLink")}
        </div>
        <div className="mt-1 text-fg">→</div>
      </a>
    </>
  );
}
