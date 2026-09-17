"use client";

import { useTranslations } from "next-intl";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { PurchaseOrdersPanel } from "@/components/purchase-orders-panel";
import { ReceivingDiscrepanciesPanel } from "@/components/receiving-discrepancies-panel";
import { VendorBillsPanel } from "@/components/vendor-bills-panel";
import { IncomingEInvoicesPanel } from "@/components/incoming-e-invoices-panel";

export default function PurchaseOrdersPage() {
  const t = useTranslations("purchaseOrders");

  return (
    <AuthenticatedShell>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      <div className="mt-6">
        <PurchaseOrdersPanel />
      </div>

      <ReceivingDiscrepanciesPanel />

      <VendorBillsPanel />

      <IncomingEInvoicesPanel />
    </AuthenticatedShell>
  );
}
