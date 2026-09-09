"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { BENEFIT_PLAN_TYPES, type BenefitPlanType } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";

interface Tier {
  id: string;
  name: string;
  monthlyEmployerCost: string;
  monthlyEmployeeCost: string;
}
interface Plan {
  id: string;
  name: string;
  type: BenefitPlanType;
  carrier: string | null;
  active: boolean;
  tiers: Tier[];
  _count: { enrollments: number };
}

export function BenefitPlansPanel() {
  const t = useTranslations("benefits");
  const tc = useTranslations("common");
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "";

  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [form, setForm] = useState({ name: "", type: "medical" as BenefitPlanType, carrier: "" });
  const [tierForms, setTierForms] = useState<Record<string, { name: string; monthlyEmployerCost: string; monthlyEmployeeCost: string }>>({});
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<Plan[]>("/benefits/plans").then(setPlans);
  }
  useEffect(load, []);

  async function createPlan(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      await apiFetch("/benefits/plans", {
        method: "POST",
        body: JSON.stringify({ name: form.name.trim(), type: form.type, carrier: form.carrier || undefined }),
      });
      setForm({ name: "", type: "medical", carrier: "" });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function addTier(planId: string) {
    const tf = tierForms[planId];
    if (!tf?.name || !tf?.monthlyEmployerCost || !tf?.monthlyEmployeeCost) return;
    setBusy(true);
    try {
      await apiFetch(`/benefits/plans/${planId}/tiers`, {
        method: "POST",
        body: JSON.stringify({ name: tf.name, monthlyEmployerCost: Number(tf.monthlyEmployerCost), monthlyEmployeeCost: Number(tf.monthlyEmployeeCost) }),
      });
      setTierForms((f) => ({ ...f, [planId]: { name: "", monthlyEmployerCost: "", monthlyEmployeeCost: "" } }));
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-10">
      <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("plansTitle")}</h2>
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">{t("plansHint")}</p>

      <form onSubmit={createPlan} className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
        <input
          required
          placeholder={t("planNamePlaceholder")}
          className="input"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <select className="input" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as BenefitPlanType }))}>
          {BENEFIT_PLAN_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`planType_${type}`)}
            </option>
          ))}
        </select>
        <input
          placeholder={t("carrierPlaceholder")}
          className="input"
          value={form.carrier}
          onChange={(e) => setForm((f) => ({ ...f, carrier: e.target.value }))}
        />
        <button type="submit" disabled={busy} className="btn-primary shrink-0">
          {t("addPlan")}
        </button>
      </form>

      {plans === null ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{tc("loading")}</p>
      ) : plans.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{t("noPlans")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {plans.map((plan) => (
            <li key={plan.id} className="card">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-gray-900 dark:text-gray-50">
                  {plan.name} <span className="text-xs text-gray-400 dark:text-gray-500">({t(`planType_${plan.type}`)}{plan.carrier ? ` · ${plan.carrier}` : ""})</span>
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">{t("enrolledCount", { count: plan._count.enrollments })}</span>
              </div>
              {plan.tiers.length > 0 && (
                <ul className="mt-2 flex flex-col gap-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {plan.tiers.map((tier) => (
                    <li key={tier.id}>
                      {tier.name}: {t("employerCost")} {tier.monthlyEmployerCost} {currency} / {t("employeeCost")} {tier.monthlyEmployeeCost} {currency}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <input
                  placeholder={t("tierNamePlaceholder")}
                  className="input w-auto"
                  value={tierForms[plan.id]?.name ?? ""}
                  onChange={(e) => setTierForms((f) => ({ ...f, [plan.id]: { name: e.target.value, monthlyEmployerCost: f[plan.id]?.monthlyEmployerCost ?? "", monthlyEmployeeCost: f[plan.id]?.monthlyEmployeeCost ?? "" } }))}
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder={t("employerCost")}
                  className="input w-28"
                  value={tierForms[plan.id]?.monthlyEmployerCost ?? ""}
                  onChange={(e) => setTierForms((f) => ({ ...f, [plan.id]: { name: f[plan.id]?.name ?? "", monthlyEmployerCost: e.target.value, monthlyEmployeeCost: f[plan.id]?.monthlyEmployeeCost ?? "" } }))}
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder={t("employeeCost")}
                  className="input w-28"
                  value={tierForms[plan.id]?.monthlyEmployeeCost ?? ""}
                  onChange={(e) => setTierForms((f) => ({ ...f, [plan.id]: { name: f[plan.id]?.name ?? "", monthlyEmployerCost: f[plan.id]?.monthlyEmployerCost ?? "", monthlyEmployeeCost: e.target.value } }))}
                />
                <button onClick={() => addTier(plan.id)} disabled={busy} className="btn-secondary shrink-0 px-2.5 py-1 text-xs">
                  {t("addTier")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
