"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { HR_CASE_ACTION_TYPES, HR_CASE_CATEGORIES, SUPPORTED_LOCALES, type HrCaseActionType, type HrCaseCategory, type HrCaseStatus } from "@cantero/shared";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";
import { formatDate } from "@/lib/format-date";

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
  payrollEmployeeId: string | null;
  hasClockInPin: boolean;
  cdlExpiresAt: string | null;
  isApprentice: boolean;
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
interface OffboardingTask {
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
interface TrainingEnrollment {
  id: string;
  status: "enrolled" | "completed";
  completedAt: string | null;
  course: { id: string; title: string; validityMonths: number | null };
}
interface PerformanceGoal {
  id: string;
  title: string;
  targetDate: string | null;
  progressPercent: number;
  completedAt: string | null;
}
interface PerformanceReview {
  id: string;
  rating: "below_expectations" | "meets_expectations" | "exceeds_expectations" | null;
  strengths: string | null;
  improvementAreas: string | null;
  submittedAt: string | null;
  cycle: { id: string; name: string };
}
interface HrCaseAction {
  id: string;
  type: HrCaseActionType;
  description: string;
  actionDate: string;
  createdByName: string;
  acknowledgedAt: string | null;
}
interface HrCase {
  id: string;
  category: HrCaseCategory;
  status: HrCaseStatus;
  description: string;
  createdAt: string;
}
interface HrCaseDetail extends HrCase {
  actions: HrCaseAction[];
}
interface BenefitEnrollment {
  id: string;
  status: "active" | "waived" | "terminated";
  effectiveDate: string;
  plan: { id: string; name: string };
  tier: { id: string; name: string };
}
interface ToolCheckout {
  id: string;
  quantity: number;
  checkedOutAt: string;
  returnedAt: string | null;
  returnCondition: "good" | "damaged" | "lost" | null;
  chargeAmount: string | null;
  item: { id: string; name: string };
}
interface ToolLiability {
  totalCharged: number;
}

export function WorkerDetail({ workerId }: { workerId: string }) {
  const t = useTranslations("team");
  const tc = useTranslations("common");
  const tp = useTranslations("performance");
  const th = useTranslations("hrCases");
  const tb = useTranslations("benefits");
  const tt = useTranslations("toolCrib");
  const { data: me } = useMe();

  const [summary, setSummary] = useState<Summary | null>(null);
  const [certifications, setCertifications] = useState<Certification[] | null>(null);
  const [certForm, setCertForm] = useState({ name: "", expiresAt: "" });
  const [form, setForm] = useState({
    name: "",
    role: "",
    hourlyCost: "",
    wageClassificationId: "",
    phone: "",
    preferredLocale: "",
    payrollEmployeeId: "",
    isApprentice: false,
  });
  const [wageClassifications, setWageClassifications] = useState<WageClassification[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const [onboardingTasks, setOnboardingTasks] = useState<OnboardingTask[] | null>(null);
  const [offboardingTasks, setOffboardingTasks] = useState<OffboardingTask[] | null>(null);
  const [trainingEnrollments, setTrainingEnrollments] = useState<TrainingEnrollment[] | null>(null);
  const [trainingBusy, setTrainingBusy] = useState(false);
  const [performanceGoals, setPerformanceGoals] = useState<PerformanceGoal[] | null>(null);
  const [performanceReviews, setPerformanceReviews] = useState<PerformanceReview[] | null>(null);
  const [goalForm, setGoalForm] = useState({ title: "", targetDate: "" });
  const [goalBusy, setGoalBusy] = useState(false);
  const [hrCases, setHrCases] = useState<HrCase[] | null>(null);
  const [hrCaseExpandedId, setHrCaseExpandedId] = useState<string | null>(null);
  const [hrCaseDetail, setHrCaseDetail] = useState<HrCaseDetail | null>(null);
  const [hrCaseForm, setHrCaseForm] = useState({ category: "attendance" as HrCaseCategory, description: "" });
  const [hrActionForm, setHrActionForm] = useState({ type: "note" as HrCaseActionType, description: "" });
  const [addingHrCase, setAddingHrCase] = useState(false);
  const [hrCaseBusy, setHrCaseBusy] = useState(false);
  const isManager = me?.user.role === "owner" || me?.user.role === "admin";
  const [benefitEnrollments, setBenefitEnrollments] = useState<BenefitEnrollment[] | null>(null);
  const [benefitsBusy, setBenefitsBusy] = useState(false);
  const [toolCheckouts, setToolCheckouts] = useState<ToolCheckout[] | null>(null);
  const [toolLiability, setToolLiability] = useState<ToolLiability | null>(null);
  const [ptoForm, setPtoForm] = useState({ deltaHours: "", reason: "" });
  const [ptoBusy, setPtoBusy] = useState(false);

  const [pinDraft, setPinDraft] = useState("");
  const [cdlExpiresAt, setCdlExpiresAt] = useState("");
  const [cdlBusy, setCdlBusy] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

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
        payrollEmployeeId: s.worker.payrollEmployeeId ?? "",
        isApprentice: s.worker.isApprentice,
      });
      setCdlExpiresAt(s.worker.cdlExpiresAt ? s.worker.cdlExpiresAt.slice(0, 10) : "");
    });
    apiFetch<Certification[]>(`/workers/${workerId}/certifications`).then(setCertifications);
    apiFetch<OnboardingTask[]>(`/workers/${workerId}/onboarding-tasks`).then(setOnboardingTasks);
    apiFetch<OffboardingTask[]>(`/workers/${workerId}/offboarding-tasks`).then(setOffboardingTasks);
    apiFetch<TrainingEnrollment[]>(`/training/workers/${workerId}/enrollments`).then(setTrainingEnrollments);
    apiFetch<PerformanceGoal[]>(`/performance/workers/${workerId}/goals`).then(setPerformanceGoals);
    apiFetch<PerformanceReview[]>(`/performance/workers/${workerId}/reviews`).then(setPerformanceReviews);
    if (isManager) apiFetch<HrCase[]>(`/workers/${workerId}/hr-cases`).then(setHrCases);
    apiFetch<BenefitEnrollment[]>(`/workers/${workerId}/benefit-enrollments`).then(setBenefitEnrollments);
    apiFetch<WageClassification[]>("/wage-classifications").then(setWageClassifications);
    apiFetch<ToolCheckout[]>(`/workers/${workerId}/tool-checkouts`).then(setToolCheckouts);
    apiFetch<ToolLiability>(`/workers/${workerId}/tool-liability`).then(setToolLiability);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [workerId, isManager]);

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

  async function toggleOffboardingTask(taskId: string) {
    await apiFetch(`/workers/${workerId}/offboarding-tasks/${taskId}/toggle`, { method: "POST" });
    load();
  }

  async function completeTraining(enrollmentId: string) {
    setTrainingBusy(true);
    try {
      await apiFetch(`/training/enrollments/${enrollmentId}/complete`, { method: "POST", body: JSON.stringify({}) });
      load();
    } finally {
      setTrainingBusy(false);
    }
  }

  async function addGoal(e: React.FormEvent) {
    e.preventDefault();
    if (!goalForm.title.trim()) return;
    setGoalBusy(true);
    try {
      await apiFetch(`/performance/workers/${workerId}/goals`, {
        method: "POST",
        body: JSON.stringify({
          title: goalForm.title.trim(),
          targetDate: goalForm.targetDate ? new Date(goalForm.targetDate).toISOString() : undefined,
        }),
      });
      setGoalForm({ title: "", targetDate: "" });
      load();
    } finally {
      setGoalBusy(false);
    }
  }

  async function updateGoalProgress(goalId: string, progressPercent: number) {
    setGoalBusy(true);
    try {
      await apiFetch(`/performance/goals/${goalId}/progress`, { method: "POST", body: JSON.stringify({ progressPercent }) });
      load();
    } finally {
      setGoalBusy(false);
    }
  }

  async function openHrCase(e: React.FormEvent) {
    e.preventDefault();
    if (!hrCaseForm.description.trim()) return;
    setHrCaseBusy(true);
    try {
      await apiFetch(`/workers/${workerId}/hr-cases`, {
        method: "POST",
        body: JSON.stringify({ category: hrCaseForm.category, description: hrCaseForm.description.trim() }),
      });
      setHrCaseForm({ category: "attendance", description: "" });
      setAddingHrCase(false);
      load();
    } finally {
      setHrCaseBusy(false);
    }
  }

  async function toggleHrCaseExpand(id: string) {
    if (hrCaseExpandedId === id) {
      setHrCaseExpandedId(null);
      setHrCaseDetail(null);
      return;
    }
    setHrCaseExpandedId(id);
    const d = await apiFetch<HrCaseDetail>(`/hr-cases/${id}`);
    setHrCaseDetail(d);
  }

  async function addHrCaseAction(caseId: string) {
    if (!hrActionForm.description.trim()) return;
    setHrCaseBusy(true);
    try {
      await apiFetch(`/hr-cases/${caseId}/actions`, {
        method: "POST",
        body: JSON.stringify({ type: hrActionForm.type, description: hrActionForm.description.trim() }),
      });
      setHrActionForm({ type: "note", description: "" });
      const d = await apiFetch<HrCaseDetail>(`/hr-cases/${caseId}`);
      setHrCaseDetail(d);
    } finally {
      setHrCaseBusy(false);
    }
  }

  async function updateHrCaseStatus(caseId: string, status: HrCaseStatus) {
    setHrCaseBusy(true);
    try {
      await apiFetch(`/hr-cases/${caseId}/status`, { method: "POST", body: JSON.stringify({ status }) });
      load();
      const d = await apiFetch<HrCaseDetail>(`/hr-cases/${caseId}`);
      setHrCaseDetail(d);
    } finally {
      setHrCaseBusy(false);
    }
  }

  async function updateEnrollmentStatus(enrollmentId: string, status: "waived" | "terminated") {
    if (status === "terminated" && !window.confirm(t("confirmTerminateEnrollment"))) return;
    setBenefitsBusy(true);
    try {
      await apiFetch(`/benefits/enrollments/${enrollmentId}/status`, { method: "POST", body: JSON.stringify({ status }) });
      load();
    } finally {
      setBenefitsBusy(false);
    }
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
          payrollEmployeeId: form.payrollEmployeeId || null,
          isApprentice: form.isApprentice,
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

  async function setClockInPin(e: React.FormEvent) {
    e.preventDefault();
    setPinBusy(true);
    setPinError(null);
    try {
      await apiFetch(`/workers/${workerId}/clock-in-pin`, { method: "PATCH", body: JSON.stringify({ pin: pinDraft }) });
      setPinDraft("");
      load();
    } catch (err) {
      setPinError(err instanceof Error ? err.message : tc("error"));
    } finally {
      setPinBusy(false);
    }
  }

  async function clearClockInPin() {
    setPinBusy(true);
    try {
      await apiFetch(`/workers/${workerId}/clock-in-pin`, { method: "DELETE" });
      load();
    } finally {
      setPinBusy(false);
    }
  }

  async function saveCdlExpiry(e: React.FormEvent) {
    e.preventDefault();
    setCdlBusy(true);
    try {
      await apiFetch(`/workers/${workerId}/cdl`, {
        method: "PATCH",
        body: JSON.stringify({ cdlExpiresAt: cdlExpiresAt ? new Date(cdlExpiresAt).toISOString() : null }),
      });
      load();
    } finally {
      setCdlBusy(false);
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
          {!isManager && (
            <div className="card flex flex-col gap-1.5 text-sm">
              <div>
                <span className="text-gray-500">{tc("name")}: </span>
                {summary.worker.name}
              </div>
              {summary.worker.role && (
                <div>
                  <span className="text-gray-500">{t("role")}: </span>
                  {summary.worker.role}
                </div>
              )}
              <p className="mt-1 text-xs text-gray-400">{t("managerOnlyHint")}</p>
            </div>
          )}
          {isManager && (
          <>
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
              {t("payrollEmployeeId")}
              <input
                placeholder={t("payrollEmployeeIdPlaceholder")}
                className="input mt-1"
                value={form.payrollEmployeeId}
                onChange={(e) => setForm((f) => ({ ...f, payrollEmployeeId: e.target.value }))}
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
            <label className="flex items-center gap-2 text-xs text-gray-500">
              <input type="checkbox" checked={form.isApprentice} onChange={(e) => setForm((f) => ({ ...f, isApprentice: e.target.checked }))} />
              {t("isApprentice")}
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

          <h2 className="mb-3 mt-8 text-sm font-semibold text-gray-700">{t("kioskPin")}</h2>
          <p className="mb-2 text-xs text-gray-500">{t("kioskPinHint")}</p>
          {summary.worker.hasClockInPin ? (
            <div className="flex items-center justify-between">
              <span className="text-xs text-success-700">{t("kioskPinSet")}</span>
              <button onClick={clearClockInPin} disabled={pinBusy} className="text-xs text-error-700 hover:underline">
                {t("kioskPinClear")}
              </button>
            </div>
          ) : (
            <form onSubmit={setClockInPin} className="flex items-center gap-2">
              <input
                type="text"
                inputMode="numeric"
                pattern="\d{4,6}"
                placeholder={t("kioskPinPlaceholder")}
                className="input flex-1"
                value={pinDraft}
                onChange={(e) => setPinDraft(e.target.value)}
              />
              <button type="submit" disabled={pinBusy || pinDraft.length < 4} className="btn-secondary shrink-0">
                {t("kioskPinSave")}
              </button>
            </form>
          )}
          {pinError && <p className="mt-1 text-xs text-error-700">{pinError}</p>}
          </>
          )}

          <h2 className="mb-3 mt-8 text-sm font-semibold text-gray-700">{t("cdlExpiry")}</h2>
          <form onSubmit={saveCdlExpiry} className="flex items-center gap-2">
            <input type="date" className="input flex-1" value={cdlExpiresAt} onChange={(e) => setCdlExpiresAt(e.target.value)} />
            <button type="submit" disabled={cdlBusy} className="btn-secondary shrink-0">
              {tc("save")}
            </button>
          </form>

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
                        {formatDate(new Date(cert.expiresAt))}
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

          {isManager && (
            <>
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
            </>
          )}

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

          {offboardingTasks !== null && offboardingTasks.length > 0 && (
            <>
              <h2 className="mb-3 mt-8 text-sm font-semibold text-gray-700">{t("offboardingChecklist")}</h2>
              <ul className="flex flex-col gap-1.5">
                {offboardingTasks.map((task) => (
                  <li key={task.id} className="card flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={task.done} onChange={() => toggleOffboardingTask(task.id)} />
                    <span className={task.done ? "text-gray-400 line-through" : "text-gray-900"}>{task.title}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {trainingEnrollments !== null && trainingEnrollments.length > 0 && (
            <>
              <h2 className="mb-3 mt-8 text-sm font-semibold text-gray-700">{t("trainingHistory")}</h2>
              <ul className="flex flex-col gap-1.5">
                {trainingEnrollments.map((en) => (
                  <li key={en.id} className="card flex items-center justify-between gap-2 text-sm">
                    <span>{en.course.title}</span>
                    {en.status === "completed" ? (
                      <span className="rounded-full bg-success-50 px-2 py-0.5 text-xs font-medium text-success-700">
                        {en.completedAt ? formatDate(new Date(en.completedAt)) : t("markComplete")}
                      </span>
                    ) : (
                      <button
                        onClick={() => completeTraining(en.id)}
                        disabled={trainingBusy}
                        className="btn-secondary px-2 py-1 text-xs"
                      >
                        {t("markComplete")}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}

          {benefitEnrollments !== null && benefitEnrollments.length > 0 && (
            <>
              <h2 className="mb-3 mt-8 text-sm font-semibold text-gray-700">{tb("title")}</h2>
              <ul className="flex flex-col gap-1.5">
                {benefitEnrollments.map((en) => (
                  <li key={en.id} className="card text-sm">
                    <div className="flex items-center justify-between">
                      <span>
                        {en.plan.name} <span className="text-xs text-gray-400">({en.tier.name})</span>
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          en.status === "active" ? "bg-success-50 text-success-700" : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {tb(`enrollmentStatus_${en.status}`)}
                      </span>
                    </div>
                    {en.status === "active" && (
                      <div className="mt-1.5 flex gap-2">
                        <button onClick={() => updateEnrollmentStatus(en.id, "waived")} disabled={benefitsBusy} className="text-xs text-gray-500 hover:underline">
                          {tb("waive")}
                        </button>
                        <button onClick={() => updateEnrollmentStatus(en.id, "terminated")} disabled={benefitsBusy} className="text-xs text-error-700 hover:underline">
                          {tb("terminate")}
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}

          {toolCheckouts !== null && toolCheckouts.length > 0 && (
            <>
              <div className="mb-3 mt-8 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-700">{tt("checkedOutTools")}</h2>
                {toolLiability && toolLiability.totalCharged > 0 && (
                  <span className="text-xs font-medium text-error-700">
                    {tt("totalCharged", { amount: toolLiability.totalCharged, currency: me?.company.currency ?? "" })}
                  </span>
                )}
              </div>
              <ul className="flex flex-col gap-1.5">
                {toolCheckouts.map((co) => (
                  <li key={co.id} className="card text-sm">
                    <div className="flex items-center justify-between">
                      <span>
                        {co.item.name} <span className="text-xs text-gray-400">× {co.quantity}</span>
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          !co.returnedAt ? "bg-warning-50 text-warning-700" : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {!co.returnedAt ? tt("stillOut") : tt(`condition_${co.returnCondition}`)}
                      </span>
                    </div>
                    {co.chargeAmount && (
                      <p className="mt-1 text-xs text-error-700">
                        {tt("chargeAmountLabel", { amount: co.chargeAmount, currency: me?.company.currency ?? "" })}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}

          <h2 className="mb-3 mt-8 text-sm font-semibold text-gray-700">{tp("goals")}</h2>
          {performanceGoals === null ? (
            <p className="text-sm text-gray-400">{tc("loading")}</p>
          ) : performanceGoals.length === 0 ? (
            <p className="text-sm text-gray-400">{tp("noGoals")}</p>
          ) : (
            <ul className="mb-3 flex flex-col gap-1.5">
              {performanceGoals.map((goal) => (
                <li key={goal.id} className="card text-sm">
                  <div className="flex items-center justify-between">
                    <span className={goal.completedAt ? "text-gray-400 line-through" : "text-gray-900"}>{goal.title}</span>
                    <span className="text-xs text-gray-400">{goal.progressPercent}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="10"
                    value={goal.progressPercent}
                    disabled={goalBusy}
                    onChange={(e) => updateGoalProgress(goal.id, Number(e.target.value))}
                    className="mt-1.5 w-full"
                  />
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={addGoal} className="flex max-w-md flex-col gap-2">
            <input
              required
              placeholder={tp("goalTitlePlaceholder")}
              className="input"
              value={goalForm.title}
              onChange={(e) => setGoalForm((f) => ({ ...f, title: e.target.value }))}
            />
            <div className="flex gap-2">
              <input
                type="date"
                className="input"
                value={goalForm.targetDate}
                onChange={(e) => setGoalForm((f) => ({ ...f, targetDate: e.target.value }))}
              />
              <button type="submit" disabled={goalBusy} className="btn-secondary shrink-0">
                {tp("addGoal")}
              </button>
            </div>
          </form>

          {performanceReviews !== null && performanceReviews.length > 0 && (
            <>
              <h2 className="mb-3 mt-8 text-sm font-semibold text-gray-700">{tp("reviewHistory")}</h2>
              <ul className="flex flex-col gap-1.5">
                {performanceReviews.map((r) => (
                  <li key={r.id} className="card text-sm">
                    <div className="flex items-center justify-between">
                      <span>{r.cycle.name}</span>
                      {r.rating && <span className="text-xs font-medium text-gray-500">{tp(`rating_${r.rating}`)}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}

          {isManager && (
            <>
              <div className="mb-3 mt-8 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-700">{th("title")}</h2>
                {!addingHrCase && (
                  <button onClick={() => setAddingHrCase(true)} className="btn-secondary px-2 py-1 text-xs">
                    {th("openCase")}
                  </button>
                )}
              </div>

              {addingHrCase && (
                <form onSubmit={openHrCase} className="card mb-3 flex flex-col gap-2">
                  <select className="input" value={hrCaseForm.category} onChange={(e) => setHrCaseForm((f) => ({ ...f, category: e.target.value as HrCaseCategory }))}>
                    {HR_CASE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {th(`category_${c}`)}
                      </option>
                    ))}
                  </select>
                  <textarea
                    required
                    rows={2}
                    placeholder={th("descriptionPlaceholder")}
                    className="input"
                    value={hrCaseForm.description}
                    onChange={(e) => setHrCaseForm((f) => ({ ...f, description: e.target.value }))}
                  />
                  <div className="flex gap-2">
                    <button type="submit" disabled={hrCaseBusy} className="btn-primary px-3 py-1 text-xs">
                      {th("openCase")}
                    </button>
                    <button type="button" onClick={() => setAddingHrCase(false)} className="btn-secondary px-3 py-1 text-xs">
                      {tc("cancel")}
                    </button>
                  </div>
                </form>
              )}

              {hrCases === null ? (
                <p className="text-sm text-gray-400">{tc("loading")}</p>
              ) : hrCases.length === 0 ? (
                <p className="text-sm text-gray-400">{th("noCases")}</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {hrCases.map((c) => {
                    const expanded = hrCaseExpandedId === c.id;
                    return (
                      <li key={c.id} className="card text-sm">
                        <button onClick={() => toggleHrCaseExpand(c.id)} className="flex w-full items-center justify-between text-left">
                          <span>{th(`category_${c.category}`)}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              c.status === "closed" || c.status === "resolved" ? "bg-success-50 text-success-700" : "bg-warning-50 text-warning-700"
                            }`}
                          >
                            {th(`caseStatus_${c.status}`)}
                          </span>
                        </button>
                        <p className="mt-1 text-xs text-gray-500">{c.description}</p>

                        {expanded && hrCaseDetail && hrCaseDetail.id === c.id && (
                          <div className="mt-2 flex flex-col gap-2 border-t border-gray-100 pt-2">
                            {c.status !== "closed" && (
                              <div className="flex flex-wrap gap-1.5">
                                {(["investigating", "resolved", "closed"] as HrCaseStatus[])
                                  .filter((s) => s !== c.status)
                                  .map((s) => (
                                    <button key={s} onClick={() => updateHrCaseStatus(c.id, s)} disabled={hrCaseBusy} className="btn-secondary px-2 py-1 text-xs">
                                      {th(`moveTo_${s}`)}
                                    </button>
                                  ))}
                              </div>
                            )}
                            <ul className="flex flex-col gap-1">
                              {hrCaseDetail.actions.map((a) => (
                                <li key={a.id} className="text-xs">
                                  <span className="font-medium text-gray-700">{th(`actionType_${a.type}`)}</span> — {a.description}
                                  <span className="text-gray-400"> ({a.createdByName}, {formatDate(new Date(a.actionDate))})</span>
                                </li>
                              ))}
                            </ul>
                            <div className="flex flex-wrap items-end gap-2">
                              <select
                                className="input w-auto"
                                value={hrActionForm.type}
                                onChange={(e) => setHrActionForm((f) => ({ ...f, type: e.target.value as HrCaseActionType }))}
                              >
                                {HR_CASE_ACTION_TYPES.map((t) => (
                                  <option key={t} value={t}>
                                    {th(`actionType_${t}`)}
                                  </option>
                                ))}
                              </select>
                              <input
                                placeholder={th("actionDescriptionPlaceholder")}
                                className="input flex-1"
                                value={hrActionForm.description}
                                onChange={(e) => setHrActionForm((f) => ({ ...f, description: e.target.value }))}
                              />
                              <button onClick={() => addHrCaseAction(c.id)} disabled={hrCaseBusy} className="btn-secondary shrink-0 px-2 py-1 text-xs">
                                {th("logAction")}
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>

        <div className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("projectHistory")}</h2>
          {summary.byProject.length === 0 ? (
            <p className="text-sm text-gray-400">{t("noProjectHistory")}</p>
          ) : (
            <div className="overflow-x-auto">
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
            </div>
          )}
        </div>
      </div>
    </AuthenticatedShell>
  );
}
