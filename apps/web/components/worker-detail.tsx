"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { SUPPORTED_LOCALES } from "@cantero/shared";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";

interface Worker {
  id: string;
  name: string;
  role: string | null;
  hourlyCost: string | null;
  active: boolean;
  ptoBalanceHours: string;
  wageClassificationId: string | null;
  phone: string | null;
  preferredLocale: string | null;
}
interface WageClassification {
  id: string;
  trade: string;
}
interface OnboardingTask {
  id: string;
  title: string;
  done: boolean;
}
interface ProjectBreakdown {
  projectId: string;
  projectName: string;
  hours: number;
  cost: number;
}
interface Summary {
  worker: Worker;
  totalHours: number;
  totalCost: number;
  byProject: ProjectBreakdown[];
}
interface Certification {
  id: string;
  name: string;
  expiresAt: string;
}

export function WorkerDetail({ workerId }: { workerId: string }) {
  const t = useTranslations("team");
  const tc = useTranslations("common");
  const { data: me } = useMe();

  const [summary, setSummary] = useState<Summary | null>(null);
  const [certifications, setCertifications] = useState<Certification[] | null>(null);
  const [certForm, setCertForm] = useState({ name: "", expiresAt: "" });
  const [form, setForm] = useState({ name: "", role: "", hourlyCost: "", wageClassificationId: "", phone: "", preferredLocale: "" });
  const [wageClassifications, setWageClassifications] = useState<WageClassification[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const [onboardingTasks, setOnboardingTasks] = useState<OnboardingTask[] | null>(null);
  const [ptoForm, setPtoForm] = useState({ deltaHours: "", reason: "" });
  const [ptoBusy, setPtoBusy] = useState(false);

  function load() {
    apiFetch<Summary>(`/workers/${workerId}/summary`).then((s) => {
      setSummary(s);
      setForm({
        name: s.worker.name,
        role: s.worker.role ?? "",
        hourlyCost: s.worker.hourlyCost ?? "",
        wageClassificationId: s.worker.wageClassificationId ?? "",
        phone: s.worker.phone ?? "",
        preferredLocale: s.worker.preferredLocale ?? "",
      });
    });
    apiFetch<Certification[]>(`/workers/${workerId}/certifications`).then(setCertifications);
    apiFetch<OnboardingTask[]>(`/workers/${workerId}/onboarding-tasks`).then(setOnboardingTasks);
    apiFetch<WageClassification[]>("/wage-classifications").then(setWageClassifications);
  }

  useEffect(load, [workerId]);

  async function adjustPto(e: React.FormEvent) {
    e.preventDefault();
    const deltaHours = Number(ptoForm.deltaHours);
    if (!deltaHours || !ptoForm.reason) return;
    setPtoBusy(true);
    try {
      await apiFetch(`/workers/${workerId}/pto-balance/adjust`, {
        method: "POST",
        body: JSON.stringify({ deltaHours, reason: ptoForm.reason }),
      });
      setPtoForm({ deltaHours: "", reason: "" });
      load();
    } finally {
      setPtoBusy(false);
    }
  }

  async function toggleOnboardingTask(taskId: string) {
    await apiFetch(`/workers/${workerId}/onboarding-tasks/${taskId}/toggle`, { method: "POST" });
    load();
  }

  async function addCertification(e: React.FormEvent) {
    e.preventDefault();
    if (!certForm.name || !certForm.expiresAt) return;
    setBusy(true);
    try {
      await apiFetch(`/workers/${workerId}/certifications`, {
        method: "POST",
        body: JSON.stringify({ name: certForm.name, expiresAt: new Date(certForm.expiresAt).toISOString() }),
      });
      setCertForm({ name: "", expiresAt: "" });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function removeCertification(certificationId: string) {
    await apiFetch(`/workers/${workerId}/certifications/${certificationId}`, { method: "DELETE" });
    load();
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setSaved(false);
    try {
      await apiFetch(`/workers/${workerId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: form.name,
          role: form.role || null,
          hourlyCost: form.hourlyCost ? Number(form.hourlyCost) : null,
          wageClassificationId: form.wageClassificationId || null,
          phone: form.phone || null,
          preferredLocale: form.preferredLocale || null,
        }),
      });
      setSaved(true);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive() {
    if (!summary) return;
    setBusy(true);
    try {
      await apiFetch(`/workers/${workerId}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !summary.worker.active }),
      });
      load();
    } finally {
      setBusy(false);
    }
  }

  if (!summary) {
    return (
      <AuthenticatedShell>
        <p className="text-gray-500">{tc("loading")}</p>
      </AuthenticatedShell>
    );
  }

  const currency = me?.company.currency ?? "";

  return (
    <AuthenticatedShell>
      <a href="/team" className="text-sm text-gray-500 hover:underline">
        ← {t("title")}
      </a>
      <div className="mt-2 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{summary.worker.name}</h1>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            summary.worker.active ? "bg-success-50 text-success-700" : "bg-gray-100 text-gray-500"
          }`}
        >
          {summary.worker.active ? t("active") : t("inactive")}
        </span>
      </div>
      <p className="text-sm text-gray-500">{summary.worker.role ?? "—"}</p>

      <div className="mt-4 flex gap-4 text-sm">
        <div className="card flex-1">
          <div className="text-xs text-gray-500">{t("totalHours")}</div>
          <div className="mt-1 text-lg font-semibold">{summary.totalHours}h</div>
        </div>
        <div className="card flex-1">
          <div className="text-xs text-gray-500">{t("totalCost")}</div>
          <div className="mt-1 text-lg font-semibold">
            {summary.totalCost} {currency}
          </div>
        </div>
        <div className="card flex-1">
          <div className="text-xs text-gray-500">{t("ptoBalance")}</div>
          <div className="mt-1 text-lg font-semibold">{summary.worker.ptoBalanceHours}h</div>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("profile")}</h2>
          <form onSubmit={saveProfile} className="card flex flex-col gap-3">
            <input
              required
              placeholder={tc("name")}
              className="input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <input
              placeholder={t("role")}
              className="input"
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            />
            <label className="text-xs text-gray-500">
              {t("hourlyCost")} ({currency})
              <input
                type="number"
                step="0.01"
                className="input mt-1"
                value={form.hourlyCost}
                onChange={(e) => setForm((f) => ({ ...f, hourlyCost: e.target.value }))}
              />
            </label>
            <label className="text-xs text-gray-500">
              {t("wageClassification")}
              <select
                className="input mt-1"
                value={form.wageClassificationId}
                onChange={(e) => setForm((f) => ({ ...f, wageClassificationId: e.target.value }))}
              >
                <option value="">{t("unclassified")}</option>
                {wageClassifications?.map((wc) => (
                  <option key={wc.id} value={wc.id}>
                    {wc.trade}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-gray-500">
              {t("phone")}
              <input
                type="tel"
                placeholder={t("phonePlaceholder")}
                className="input mt-1"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </label>
            <label className="text-xs text-gray-500">
              {t("preferredLocale")}
              <select
                className="input mt-1"
                value={form.preferredLocale}
                onChange={(e) => setForm((f) => ({ ...f, preferredLocale: e.target.value }))}
              >
                <option value="">{t("preferredLocaleDefault")}</option>
                {SUPPORTED_LOCALES.map((l) => (
                  <option key={l} value={l}>
                    {l.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-2">
              <button type="submit" disabled={busy} className="btn-primary">
                {tc("save")}
              </button>
              {saved && <span className="text-xs text-success-700">{tc("saved")}</span>}
            </div>
          </form>
          <button onClick={toggleActive} disabled={busy} className="btn-secondary mt-3 w-full">
            {summary.worker.active ? t("deactivate") : t("reactivate")}
          </button>

          <h2 className="mb-3 mt-8 text-sm font-semibold text-gray-700">{t("certifications")}</h2>
          {certifications === null ? (
            <p className="text-sm text-gray-400">{tc("loading")}</p>
          ) : certifications.length === 0 ? (
            <p className="text-sm text-gray-400">{t("noCertifications")}</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {certifications.map((cert) => {
                const expired = new Date(cert.expiresAt) < new Date();
                return (
                  <li key={cert.id} className="card flex items-center justify-between text-sm">
                    <span>
                      {cert.name}
                      {" — "}
                      <span className={expired ? "text-error-700" : "text-gray-500"}>
                        {new Date(cert.expiresAt).toLocaleDateString()}
                      </span>
                    </span>
                    <button onClick={() => removeCertification(cert.id)} className="text-gray-400 hover:text-error-600">
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <form onSubmit={addCertification} className="mt-3 flex flex-col gap-2">
            <input
              required
              placeholder={t("certificationNamePlaceholder")}
              className="input"
              value={certForm.name}
              onChange={(e) => setCertForm((f) => ({ ...f, name: e.target.value }))}
            />
            <input
              required
              type="date"
              className="input"
              value={certForm.expiresAt}
              onChange={(e) => setCertForm((f) => ({ ...f, expiresAt: e.target.value }))}
            />
            <button type="submit" disabled={busy} className="btn-secondary self-start">
              {t("addCertification")}
            </button>
          </form>

          <h2 className="mb-3 mt-8 text-sm font-semibold text-gray-700">{t("ptoBalance")}</h2>
          <form onSubmit={adjustPto} className="card flex flex-col gap-2">
            <input
              required
              type="number"
              step="0.5"
              placeholder={t("ptoDeltaHoursPlaceholder")}
              className="input"
              value={ptoForm.deltaHours}
              onChange={(e) => setPtoForm((f) => ({ ...f, deltaHours: e.target.value }))}
            />
            <input
              required
              placeholder={t("ptoReasonPlaceholder")}
              className="input"
              value={ptoForm.reason}
              onChange={(e) => setPtoForm((f) => ({ ...f, reason: e.target.value }))}
            />
            <button type="submit" disabled={ptoBusy} className="btn-secondary self-start">
              {t("adjustPtoBalance")}
            </button>
          </form>

          <h2 className="mb-3 mt-8 text-sm font-semibold text-gray-700">{t("onboardingChecklist")}</h2>
          {onboardingTasks === null ? (
            <p className="text-sm text-gray-400">{tc("loading")}</p>
          ) : onboardingTasks.length === 0 ? (
            <p className="text-sm text-gray-400">{t("noOnboardingTasks")}</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {onboardingTasks.map((task) => (
                <li key={task.id} className="card flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={task.done} onChange={() => toggleOnboardingTask(task.id)} />
                  <span className={task.done ? "text-gray-400 line-through" : "text-gray-900"}>{task.title}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("projectHistory")}</h2>
          {summary.byProject.length === 0 ? (
            <p className="text-sm text-gray-400">{t("noProjectHistory")}</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2">{t("project")}</th>
                  <th className="text-right">{t("hours")}</th>
                  <th className="text-right">{t("cost")}</th>
                </tr>
              </thead>
              <tbody>
                {summary.byProject.map((p) => (
                  <tr key={p.projectId} className="border-b border-gray-100">
                    <td className="py-2">{p.projectName}</td>
                    <td className="text-right">{p.hours}h</td>
                    <td className="text-right">
                      {p.cost} {currency}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AuthenticatedShell>
  );
}
