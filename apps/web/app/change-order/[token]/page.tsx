"use client";

import { use, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, ApiError } from "@/lib/api-client";

interface PublicLine {
  id: string;
  description: string;
  unit: string;
  quantity: string;
  lineTotal: string;
}
type ClientDecision = "pending" | "approved" | "rejected";
interface PublicChangeOrder {
  id: string;
  number: number;
  title: string;
  description: string | null;
  clientDecision: ClientDecision;
  decisionAt: string | null;
  clientDecisionNote: string | null;
  companyName: string;
  currency: string;
  estimateName: string;
  lines: PublicLine[];
  subtotal: string;
  markupAmount: string;
  taxAmount: string;
  grandTotal: string;
}

export default function PublicChangeOrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const t = useTranslations("estimates");
  const tc = useTranslations("common");

  const [changeOrder, setChangeOrder] = useState<PublicChangeOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<PublicChangeOrder>(`/public/change-orders/${token}`)
      .then(setChangeOrder)
      .catch((err) => setError(err instanceof ApiError ? err.message : t("linkNotFound")));
  }

  useEffect(load, [token]);

  async function decide(decision: "approved" | "rejected") {
    setBusy(true);
    try {
      await apiFetch(`/public/change-orders/${token}/decision`, {
        method: "POST",
        body: JSON.stringify({ decision, note: note || undefined }),
      });
      load();
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6 py-12">
        <p className="text-sm text-gray-500">{error}</p>
      </main>
    );
  }

  if (!changeOrder) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6 py-12">
        <p className="text-sm text-gray-500">{tc("loading")}</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen justify-center bg-gray-50 px-6 py-12">
      <div className="w-full max-w-2xl">
        <div className="mb-6 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-sm font-semibold text-white">
            C
          </span>
          <span className="text-lg font-semibold tracking-tight text-gray-900">{changeOrder.companyName}</span>
        </div>

        <div className="card">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
            {t("changeOrderFor", { estimateName: changeOrder.estimateName })}
          </p>
          <h1 className="mt-1 text-xl font-semibold text-gray-900">
            CO-{changeOrder.number} — {changeOrder.title}
          </h1>
          {changeOrder.description && <p className="mt-1 text-sm text-gray-500">{changeOrder.description}</p>}

          <table className="mt-6 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-2">{t("rateItem")}</th>
                <th>{t("quantity")}</th>
                <th className="text-right">{t("lineTotal")}</th>
              </tr>
            </thead>
            <tbody>
              {changeOrder.lines.map((l) => (
                <tr key={l.id} className="border-b border-gray-100">
                  <td className="py-2">{l.description}</td>
                  <td>
                    {l.quantity} {l.unit}
                  </td>
                  <td className="text-right">
                    {l.lineTotal} {changeOrder.currency}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <dl className="mt-4 flex flex-col gap-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">{t("subtotal")}</dt>
              <dd>
                {changeOrder.subtotal} {changeOrder.currency}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">{t("markupAmount")}</dt>
              <dd>
                {changeOrder.markupAmount} {changeOrder.currency}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">{t("taxAmount")}</dt>
              <dd>
                {changeOrder.taxAmount} {changeOrder.currency}
              </dd>
            </div>
            <div className="flex justify-between border-t border-gray-200 pt-2 font-semibold">
              <dt>{t("grandTotal")}</dt>
              <dd>
                {changeOrder.grandTotal} {changeOrder.currency}
              </dd>
            </div>
          </dl>

          {changeOrder.clientDecision === "pending" ? (
            <div className="mt-6 border-t border-gray-100 pt-4">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-gray-700">{t("clientNoteOptional")}</span>
                <textarea rows={2} className="input" value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
              <div className="mt-3 flex gap-2">
                <button onClick={() => decide("approved")} disabled={busy} className="btn-primary flex-1">
                  {t("clientApprove")}
                </button>
                <button onClick={() => decide("rejected")} disabled={busy} className="btn-secondary flex-1">
                  {t("clientReject")}
                </button>
              </div>
            </div>
          ) : (
            <div
              className={`mt-6 rounded-lg border-t px-4 py-3 text-sm ${
                changeOrder.clientDecision === "approved"
                  ? "border-success-200 bg-success-50 text-success-700"
                  : "border-error-200 bg-error-50 text-error-700"
              }`}
            >
              {changeOrder.clientDecision === "approved" ? t("clientDecisionThanksApproved") : t("clientDecisionThanksRejected")}
              {changeOrder.decisionAt && (
                <span className="block text-xs opacity-75">{new Date(changeOrder.decisionAt).toLocaleString()}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
