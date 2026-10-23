"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, notifyApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/format-currency";
import { Alert } from "@/components/ui/alert";

interface Plan {
  id: string;
  code: string;
  name: string;
  pricePerSeat: string;
  currency: string;
}
interface Subscription {
  seats: number;
  status: string;
  plan: Plan;
}
interface Member {
  userId: string;
}

export function BillingPlanPanel({ isManager }: { isManager: boolean }) {
  const t = useTranslations("settings");
  const tl = useTranslations("labels");
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [seatsInput, setSeatsInput] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<Subscription>("/billing/subscription").then((s) => {
      setSubscription(s);
      setSeatsInput(String(s.seats));
    }).catch(notifyApiError);
    apiFetch<Plan[]>("/billing/plans").then(setPlans).catch(notifyApiError);
    apiFetch<Member[]>("/company/members").then((list) => setMemberCount(list.length)).catch(notifyApiError);
  }

  useEffect(load, []);

  async function changePlan(planCode: string) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/billing/change-plan", { method: "POST", body: JSON.stringify({ planCode }) });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("error"));
    } finally {
      setBusy(false);
    }
  }

  async function updateSeats(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/billing/seats", { method: "POST", body: JSON.stringify({ seats: Number(seatsInput) }) });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("error"));
    } finally {
      setBusy(false);
    }
  }

  async function openBillingPortal() {
    setBusy(true);
    setError(null);
    try {
      const { url } = await apiFetch<{ url: string }>("/billing/portal-session", { method: "POST" });
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : t("error"));
      setBusy(false);
    }
  }

  return (
    <section id="billing" className="card">
      <h2 className="mb-4 text-sm font-semibold text-fg-muted">{t("plan")}</h2>
      {error && <Alert tone="danger" className="mb-3">{error}</Alert>}
      <div className="flex flex-col gap-2">
        {plans.map((plan) => {
          const isCurrent = subscription?.plan.code === plan.code;
          return (
            <div
              key={plan.id}
              className={`flex items-center justify-between rounded-md border px-3 py-2 ${isCurrent ? "border-gray-900 bg-gray-50 dark:bg-gray-700" : "border-gray-200 dark:border-gray-700"}`}
            >
              <div>
                <div className="text-sm font-medium">
                  {plan.name} {isCurrent && `· ${t("currentPlan")}`}
                </div>
                <div className="text-xs text-fg-subtle">
                  {tl("perSeatPerMonth", { amount: formatCurrency(plan.pricePerSeat, plan.currency) })}
                </div>
              </div>
              {isManager && !isCurrent && (
                <button onClick={() => changePlan(plan.code)} disabled={busy} className="btn-secondary px-3 py-1 text-xs">
                  {t("changePlan")}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {subscription && memberCount !== null && (
        <p className="mt-3 text-xs text-fg-subtle">
          {t("seatsUsed", { used: memberCount, total: subscription.seats })}
        </p>
      )}

      {isManager && (
        <form onSubmit={updateSeats} className="mt-4 flex items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-fg-subtle">
            {t("seats")}
            <input
              type="number"
              min="1"
              className="input mt-1 w-24"
              value={seatsInput}
              onChange={(e) => setSeatsInput(e.target.value)}
            />
          </label>
          <button type="submit" disabled={busy} className="btn-secondary">
            {t("updateSeats")}
          </button>
        </form>
      )}

      {isManager && (
        <button type="button" onClick={openBillingPortal} disabled={busy} className="btn-secondary mt-3">
          {t("manageBilling")}
        </button>
      )}
    </section>
  );
}
