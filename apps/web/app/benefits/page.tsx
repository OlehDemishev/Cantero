"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";

interface Worker {
  id: string;
  name: string;
}
interface Tier {
  id: string;
  name: string;
  monthlyEmployerCost: string;
  monthlyEmployeeCost: string;
}
interface Plan {
  id: string;
  name: string;
  tiers: Tier[];
}
interface CostSummary {
  activeEnrollmentCount: number;
  totalMonthlyEmployerCost: number;
  totalMonthlyEmployeeCost: number;
}

export default function BenefitsPage() {
  const t = useTranslations("benefits");
  const tc = useTranslations("common");
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "";
  const isManager = me?.user.role === "owner" || me?.user.role === "admin";

  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [form, setForm] = useState({ workerId: "", planId: "", tierId: "", effectiveDate: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function load() {
    apiFetch<CostSummary>("/benefits/cost-summary").then(setSummary);
  }
  useEffect(load, []);
  useEffect(() => {
    apiFetch<Worker[]>("/workers").then((list) => {
      setWorkers(list);
      if (list[0]) setForm((f) => ({ ...f, workerId: f.workerId || list[0].id }));
    });
    apiFetch<Plan[]>("/benefits/plans").then((list) => {
      setPlans(list);
      if (list[0]) setForm((f) => ({ ...f, planId: f.planId || list[0].id, tierId: list[0].tiers[0]?.id ?? "" }));
    });
  }, []);

  const selectedPlan = plans.find((p) => p.id === form.planId);

  async function enroll(e: React.FormEvent) {
    e.preventDefault();
    if (!form.workerId || !form.planId || !form.tierId || !form.effectiveDate) return;
    setBusy(true);
    setMessage(null);
    try {
      await apiFetch(`/benefits/plans/${form.planId}/enroll/${form.workerId}`, {
        method: "POST",
        body: JSON.stringify({ tierId: form.tierId, effectiveDate: new Date(form.effectiveDate).toISOString() }),
      });
      setMessage(t("enrolled"));
      load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : tc("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthenticatedShell>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      {summary && summary.activeEnrollmentCount > 0 && (
        <div className="card mt-4 grid grid-cols-3 gap-3 max-w-lg">
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{t("activeEnrollments")}</div>
            <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-50">{summary.activeEnrollmentCount}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{t("totalEmployerCost")}</div>
            <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-50">
              {summary.totalMonthlyEmployerCost} {currency}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{t("totalEmployeeCost")}</div>
            <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-50">
              {summary.totalMonthlyEmployeeCost} {currency}
            </div>
          </div>
        </div>
      )}

      <div className="card mt-6 max-w-lg">
        <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("enrollWorker")}</h2>
        {plans.length === 0 ? (
          <EmptyState
            message={t("noPlansYet")}
            cta={isManager ? { label: t("managePlans"), href: "/settings?tab=team" } : undefined}
          />
        ) : (
          <form onSubmit={enroll} className="flex flex-col gap-2">
            <select className="input" value={form.workerId} onChange={(e) => setForm((f) => ({ ...f, workerId: e.target.value }))}>
              {workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <select
              className="input"
              value={form.planId}
              onChange={(e) => {
                const plan = plans.find((p) => p.id === e.target.value);
                setForm((f) => ({ ...f, planId: e.target.value, tierId: plan?.tiers[0]?.id ?? "" }));
              }}
            >
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select className="input" value={form.tierId} onChange={(e) => setForm((f) => ({ ...f, tierId: e.target.value }))}>
              {selectedPlan?.tiers.map((tier) => (
                <option key={tier.id} value={tier.id}>
                  {tier.name} ({tier.monthlyEmployeeCost} {currency}/mo)
                </option>
              ))}
            </select>
            <label className="text-xs text-gray-500 dark:text-gray-400">
              {t("effectiveDate")}
              <input
                required
                type="date"
                className="input mt-1"
                value={form.effectiveDate}
                onChange={(e) => setForm((f) => ({ ...f, effectiveDate: e.target.value }))}
              />
            </label>
            <button type="submit" disabled={busy || !selectedPlan?.tiers.length} className="btn-primary self-start">
              {t("enroll")}
            </button>
            {message && <p className="text-xs text-gray-600 dark:text-gray-300">{message}</p>}
          </form>
        )}
      </div>
    </AuthenticatedShell>
  );
}
