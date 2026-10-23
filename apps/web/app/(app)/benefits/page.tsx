"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/ui/empty-state";
import { apiFetch, notifyApiError } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { useMe } from "@/lib/use-me";
import { useCan } from "@/lib/permissions";
import { formatCurrency } from "@/lib/format-currency";
import { PageHeader } from "@/components/ui/page-header";
import { Field } from "@/components/ui/field";

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
  const tl = useTranslations("labels");
  const ta = useTranslations("a11y");
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "";
  const isManager = useCan()("hr.payroll");

  const { data: summary = null, reload: reloadSummary } = useApi<CostSummary>("/benefits/cost-summary");
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [form, setForm] = useState({ workerId: "", planId: "", tierId: "", effectiveDate: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function load() {
    void reloadSummary();
  }
  useEffect(() => {
    apiFetch<Worker[]>("/workers").then((list) => {
      setWorkers(list);
      if (list[0]) setForm((f) => ({ ...f, workerId: f.workerId || list[0].id }));
    }).catch(notifyApiError);
    apiFetch<Plan[]>("/benefits/plans").then((list) => {
      setPlans(list);
      if (list[0]) setForm((f) => ({ ...f, planId: f.planId || list[0].id, tierId: list[0].tiers[0]?.id ?? "" }));
    }).catch(notifyApiError);
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
    <>
      <PageHeader title={t("title")} />

      {summary && summary.activeEnrollmentCount > 0 && (
        <div className="card mt-4 grid grid-cols-3 gap-3 max-w-lg">
          <div>
            <div className="text-xs text-fg-subtle">{t("activeEnrollments")}</div>
            <div className="mt-1 text-lg font-semibold text-fg">{summary.activeEnrollmentCount}</div>
          </div>
          <div>
            <div className="text-xs text-fg-subtle">{t("totalEmployerCost")}</div>
            <div className="mt-1 text-lg font-semibold text-fg">
              {formatCurrency(summary.totalMonthlyEmployerCost, currency)}
            </div>
          </div>
          <div>
            <div className="text-xs text-fg-subtle">{t("totalEmployeeCost")}</div>
            <div className="mt-1 text-lg font-semibold text-fg">
              {formatCurrency(summary.totalMonthlyEmployeeCost, currency)}
            </div>
          </div>
        </div>
      )}

      <div className="card mt-6 max-w-lg">
        <h2 className="mb-3 text-sm font-semibold text-fg-muted">{t("enrollWorker")}</h2>
        {plans.length === 0 ? (
          <EmptyState
            message={t("noPlansYet")}
            cta={isManager ? { label: t("managePlans"), href: "/settings?tab=team" } : undefined}
          />
        ) : (
          <form onSubmit={enroll} className="flex flex-col gap-2">
            <select aria-label={ta("worker")} className="input" value={form.workerId} onChange={(e) => setForm((f) => ({ ...f, workerId: e.target.value }))}>
              {workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <select aria-label={ta("plan")}
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
            <select aria-label={ta("tier")} className="input" value={form.tierId} onChange={(e) => setForm((f) => ({ ...f, tierId: e.target.value }))}>
              {selectedPlan?.tiers.map((tier) => (
                <option key={tier.id} value={tier.id}>
                  {tier.name} ({tl("perMonth", { amount: formatCurrency(tier.monthlyEmployeeCost, currency) })})
                </option>
              ))}
            </select>
            <Field label={t("effectiveDate")} size="sm">
              <input
                required
                type="date"
                className="input"
                value={form.effectiveDate}
                onChange={(e) => setForm((f) => ({ ...f, effectiveDate: e.target.value }))}
              />
            </Field>
            <button type="submit" disabled={busy || !selectedPlan?.tiers.length} className="btn-primary self-start">
              {t("enroll")}
            </button>
            {message && <p className="text-xs text-gray-600 dark:text-gray-300">{message}</p>}
          </form>
        )}
      </div>
    </>
  );
}
