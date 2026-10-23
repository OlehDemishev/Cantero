"use client";

import { useTranslations } from "next-intl";
import { PurchaseOrdersPanel } from "@/components/purchase-orders-panel";
import { ReceivingDiscrepanciesPanel } from "@/components/receiving-discrepancies-panel";
import { VendorBillsPanel } from "@/components/vendor-bills-panel";
import { IncomingEInvoicesPanel } from "@/components/incoming-e-invoices-panel";
import { PageHeader } from "@/components/ui/page-header";

export default function PurchaseOrdersPage() {
  const t = useTranslations("purchaseOrders");

  return (
    <>
      <PageHeader title={t("title")} />

      <div className="mt-6">
        <PurchaseOrdersPanel />
      </div>

      <ReceivingDiscrepanciesPanel />

      <VendorBillsPanel />

      <IncomingEInvoicesPanel />
    </>
  );
}
