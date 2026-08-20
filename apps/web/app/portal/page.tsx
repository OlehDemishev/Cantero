"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { getPortalToken, portalApiFetch, clearPortalToken } from "@/lib/portal-api-client";

interface Me {
  name: string;
  companyName: string;
  currency: string;
}
interface EstimateSummary {
  id: string;
  name: string;
  variantLabel: string | null;
  clientDecision: "pending" | "approved" | "rejected";
  sentAt: string | null;
  grandTotal: string;
  project: { name: string } | null;
}
interface ChangeOrderSummary {
  id: string;
  number: number;
  title: string;
  clientDecision: "pending" | "approved" | "rejected";
  sentAt: string | null;
  grandTotal: string;
  estimate: { name: string };
}
interface InvoiceSummary {
  id: string;
  number: string;
  status: "sent" | "paid" | "void";
  total: string;
  dueDate: string | null;
  project: { name: string };
}

export default function PortalDashboardPage() {
  const t = useTranslations("portal");
  const te = useTranslations("estimates");
  const ti = useTranslations("invoices");
  const router = useRouter();

  const [me, setMe] = useState<Me | null>(null);
  const [estimates, setEstimates] = useState<EstimateSummary[] | null>(null);
  const [changeOrders, setChangeOrders] = useState<ChangeOrderSummary[] | null>(null);
  const [invoices, setInvoices] = useState<InvoiceSummary[] | null>(null);

  useEffect(() => {
    if (!getPortalToken()) {
      router.replace("/portal/login");
      return;
    }
    portalApiFetch<Me>("/portal/me").then(setMe);
    portalApiFetch<EstimateSummary[]>("/portal/estimates").then(setEstimates);
    portalApiFetch<ChangeOrderSummary[]>("/portal/change-orders").then(setChangeOrders);
    portalApiFetch<InvoiceSummary[]>("/portal/invoices").then(setInvoices);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function logout() {
    clearPortalToken();
    router.replace("/portal/login");
  }

  if (!me) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6 py-12">
        <p className="text-sm text-gray-500">{t("loading")}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-sm font-semibold text-white">
              C
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-900">{me.companyName}</p>
              <p className="text-xs text-gray-500">{t("welcome", { name: me.name })}</p>
            </div>
          </div>
          <button onClick={logout} className="btn-secondary px-3 py-1.5 text-xs">
            {t("logout")}
          </button>
        </div>

        <section className="card">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("estimates")}</h2>
          {!estimates || estimates.length === 0 ? (
            <p className="text-sm text-gray-400">{t("noEstimates")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {estimates.map((e) => (
                <li key={e.id}>
                  <a
                    href={`/portal/estimates/${e.id}`}
                    className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50"
                  >
                    <span>
                      {e.name}
                      {e.variantLabel && <span className="ml-2 text-xs text-brand-600">{e.variantLabel}</span>}
                      <span className="ml-2 text-xs text-gray-400">{e.project?.name}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">
                        {e.grandTotal} {me.currency}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          e.clientDecision === "approved"
                            ? "bg-success-50 text-success-700"
                            : e.clientDecision === "rejected"
                              ? "bg-error-50 text-error-700"
                              : "bg-warning-50 text-warning-700"
                        }`}
                      >
                        {te(`clientDecision_${e.clientDecision}`)}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card mt-6">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("changeOrders")}</h2>
          {!changeOrders || changeOrders.length === 0 ? (
            <p className="text-sm text-gray-400">{t("noChangeOrders")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {changeOrders.map((co) => (
                <li key={co.id}>
                  <a
                    href={`/portal/change-orders/${co.id}`}
                    className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50"
                  >
                    <span>
                      CO-{co.number} — {co.title}
                      <span className="ml-2 text-xs text-gray-400">{co.estimate.name}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">
                        {co.grandTotal} {me.currency}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          co.clientDecision === "approved"
                            ? "bg-success-50 text-success-700"
                            : co.clientDecision === "rejected"
                              ? "bg-error-50 text-error-700"
                              : "bg-warning-50 text-warning-700"
                        }`}
                      >
                        {te(`clientDecision_${co.clientDecision}`)}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card mt-6">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("invoices")}</h2>
          {!invoices || invoices.length === 0 ? (
            <p className="text-sm text-gray-400">{t("noInvoices")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {invoices.map((inv) => (
                <li key={inv.id}>
                  <a
                    href={`/portal/invoices/${inv.id}`}
                    className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50"
                  >
                    <span>
                      {inv.number}
                      <span className="ml-2 text-xs text-gray-400">{inv.project.name}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">
                        {inv.total} {me.currency}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          inv.status === "paid" ? "bg-success-50 text-success-700" : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {ti(inv.status)}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
