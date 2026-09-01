"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { getPortalToken, portalApiFetch, clearPortalToken } from "@/lib/portal-api-client";

interface Me {
  name: string;
  companyName: string;
  currency: string;
  savedCardBrand: string | null;
  savedCardLast4: string | null;
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
interface ProjectProgress {
  tasksTotal: number;
  tasksDone: number;
  taskPercent: number | null;
  budgetPercent: number | null;
}
interface PortalProject {
  id: string;
  name: string;
  warrantyExpiresAt: string | null;
  isUnderWarranty: boolean;
  progress: ProjectProgress;
}
type WarrantyClaimStatus = "open" | "in_progress" | "resolved" | "denied";
interface WarrantyClaimSummary {
  id: string;
  title: string;
  location: string | null;
  status: WarrantyClaimStatus;
  project: { id: string; name: string };
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
  const [projects, setProjects] = useState<PortalProject[] | null>(null);
  const [warrantyClaims, setWarrantyClaims] = useState<WarrantyClaimSummary[] | null>(null);
  const [claimForm, setClaimForm] = useState({ projectId: "", title: "", description: "", location: "" });
  const [claimBusy, setClaimBusy] = useState(false);
  const [claimMessage, setClaimMessage] = useState<string | null>(null);
  const [paymentMethodBusy, setPaymentMethodBusy] = useState(false);

  function loadMe() {
    portalApiFetch<Me>("/portal/me").then(setMe);
  }

  async function saveCard() {
    setPaymentMethodBusy(true);
    try {
      const { url } = await portalApiFetch<{ url: string }>("/portal/payment-method/setup", { method: "POST" });
      window.location.href = url;
    } finally {
      setPaymentMethodBusy(false);
    }
  }

  async function removeCard() {
    setPaymentMethodBusy(true);
    try {
      await portalApiFetch("/portal/payment-method", { method: "DELETE" });
      loadMe();
    } finally {
      setPaymentMethodBusy(false);
    }
  }

  function loadWarranty() {
    portalApiFetch<PortalProject[]>("/portal/projects").then((list) => {
      setProjects(list);
      const firstUnderWarranty = list.find((p) => p.isUnderWarranty);
      if (firstUnderWarranty) setClaimForm((f) => ({ ...f, projectId: f.projectId || firstUnderWarranty.id }));
    });
    portalApiFetch<WarrantyClaimSummary[]>("/portal/warranty").then(setWarrantyClaims);
  }

  useEffect(() => {
    if (!getPortalToken()) {
      router.replace("/portal/login");
      return;
    }
    loadMe();
    portalApiFetch<EstimateSummary[]>("/portal/estimates").then(setEstimates);
    portalApiFetch<ChangeOrderSummary[]>("/portal/change-orders").then(setChangeOrders);
    portalApiFetch<InvoiceSummary[]>("/portal/invoices").then(setInvoices);
    loadWarranty();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submitClaim(e: React.FormEvent) {
    e.preventDefault();
    if (!claimForm.projectId) return;
    setClaimBusy(true);
    setClaimMessage(null);
    try {
      await portalApiFetch("/portal/warranty", {
        method: "POST",
        body: JSON.stringify({
          projectId: claimForm.projectId,
          title: claimForm.title,
          description: claimForm.description || undefined,
          location: claimForm.location || undefined,
        }),
      });
      setClaimForm((f) => ({ ...f, title: "", description: "", location: "" }));
      setClaimMessage(t("claimSubmitted"));
      loadWarranty();
    } catch (err) {
      setClaimMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setClaimBusy(false);
    }
  }

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

        {projects && projects.length > 0 && (
          <section className="card mb-6">
            <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("projects")}</h2>
            <ul className="flex flex-col gap-2">
              {projects.map((p) => (
                <li key={p.id} className="flex items-center justify-between">
                  <span className="text-sm text-gray-800">{p.name}</span>
                  <a href={`/portal/projects/${p.id}/messages`} className="text-xs text-brand-700 hover:underline">
                    {t("messages")}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {projects && projects.some((p) => p.progress.taskPercent !== null || p.progress.budgetPercent !== null) && (
          <section className="card mb-6">
            <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("projectProgress")}</h2>
            <ul className="flex flex-col gap-4">
              {projects
                .filter((p) => p.progress.taskPercent !== null || p.progress.budgetPercent !== null)
                .map((p) => (
                  <li key={p.id}>
                    <p className="mb-2 text-sm font-medium text-gray-800">{p.name}</p>
                    {p.progress.taskPercent !== null && (
                      <div className="mb-2">
                        <div className="mb-1 flex justify-between text-xs text-gray-500">
                          <span>{t("tasksComplete")}</span>
                          <span>
                            {p.progress.tasksDone}/{p.progress.tasksTotal} · {p.progress.taskPercent}%
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                          <div className="h-full rounded-full bg-brand-500" style={{ width: `${p.progress.taskPercent}%` }} />
                        </div>
                      </div>
                    )}
                    {p.progress.budgetPercent !== null && (
                      <div>
                        <div className="mb-1 flex justify-between text-xs text-gray-500">
                          <span>{t("budgetPaid")}</span>
                          <span>{p.progress.budgetPercent}%</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                          <div
                            className="h-full rounded-full bg-success-500"
                            style={{ width: `${Math.min(p.progress.budgetPercent, 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </li>
                ))}
            </ul>
          </section>
        )}

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

        <section className="card mt-6">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("paymentMethod")}</h2>
          {me.savedCardLast4 ? (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700">
                {t("cardOnFile", { brand: me.savedCardBrand ?? "", last4: me.savedCardLast4 })}
              </span>
              <button onClick={removeCard} disabled={paymentMethodBusy} className="btn-secondary px-2 py-1 text-xs">
                {t("removeCard")}
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">{t("noCardOnFile")}</span>
              <button onClick={saveCard} disabled={paymentMethodBusy} className="btn-secondary px-2 py-1 text-xs">
                {t("saveCard")}
              </button>
            </div>
          )}
        </section>

        <section className="card mt-6">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("warranty")}</h2>
          {!warrantyClaims || warrantyClaims.length === 0 ? (
            <p className="text-sm text-gray-400">{t("noWarrantyClaims")}</p>
          ) : (
            <ul className="mb-4 flex flex-col gap-2">
              {warrantyClaims.map((claim) => (
                <li key={claim.id} className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-sm">
                  <span>
                    {claim.title}
                    <span className="ml-2 text-xs text-gray-400">{claim.project.name}</span>
                    {claim.location && <span className="ml-2 text-xs text-gray-400">— {claim.location}</span>}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      claim.status === "resolved"
                        ? "bg-success-50 text-success-700"
                        : claim.status === "denied"
                          ? "bg-error-50 text-error-700"
                          : claim.status === "in_progress"
                            ? "bg-brand-50 text-brand-700"
                            : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {t(`claimStatus_${claim.status}`)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {!projects || projects.filter((p) => p.isUnderWarranty).length === 0 ? (
            <p className="text-sm text-gray-400">{t("noProjectsUnderWarranty")}</p>
          ) : (
            <form onSubmit={submitClaim} className="flex flex-col gap-2">
              <label className="text-xs text-gray-500">
                {t("project")}
                <select
                  className="input mt-1"
                  value={claimForm.projectId}
                  onChange={(e) => setClaimForm((f) => ({ ...f, projectId: e.target.value }))}
                >
                  {projects
                    .filter((p) => p.isUnderWarranty)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </label>
              <input
                required
                placeholder={t("claimTitlePlaceholder")}
                className="input"
                value={claimForm.title}
                onChange={(e) => setClaimForm((f) => ({ ...f, title: e.target.value }))}
              />
              <input
                placeholder={t("locationPlaceholder")}
                className="input"
                value={claimForm.location}
                onChange={(e) => setClaimForm((f) => ({ ...f, location: e.target.value }))}
              />
              <textarea
                rows={2}
                placeholder={t("descriptionPlaceholder")}
                className="input"
                value={claimForm.description}
                onChange={(e) => setClaimForm((f) => ({ ...f, description: e.target.value }))}
              />
              <button type="submit" disabled={claimBusy} className="btn-primary self-start">
                {t("submitClaim")}
              </button>
              {claimMessage && <p className="text-xs text-gray-600">{claimMessage}</p>}
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
