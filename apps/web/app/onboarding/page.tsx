"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch, ApiError } from "@/lib/api-client";
import { MEMBERSHIP_ROLES_MANAGEABLE } from "@cantero/shared";

type StepKey = "catalog" | "invite" | "project" | "done";
const STEPS: StepKey[] = ["catalog", "invite", "project", "done"];

export default function OnboardingPage() {
  const t = useTranslations("onboarding");
  const tc = useTranslations("common");
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  const [catalogState, setCatalogState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [catalogResult, setCatalogResult] = useState<{ materialsCreated: number; rateItemsCreated: number } | null>(null);

  const [inviteForm, setInviteForm] = useState({ email: "", role: "worker" });
  const [invitedEmails, setInvitedEmails] = useState<string[]>([]);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [clientName, setClientName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectBusy, setProjectBusy] = useState(false);
  const [projectDone, setProjectDone] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);

  const step = STEPS[stepIndex];

  async function loadStarterCatalog() {
    setCatalogState("loading");
    try {
      const result = await apiFetch<{ materialsCreated: number; rateItemsCreated: number }>(
        "/estimates/rate-catalog/starter",
        { method: "POST" },
      );
      setCatalogResult(result);
      setCatalogState("done");
    } catch {
      setCatalogState("error");
    }
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteBusy(true);
    setInviteError(null);
    try {
      await apiFetch("/company/invites", { method: "POST", body: JSON.stringify(inviteForm) });
      setInvitedEmails((emails) => [...emails, inviteForm.email]);
      setInviteForm({ email: "", role: "worker" });
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : tc("error"));
    } finally {
      setInviteBusy(false);
    }
  }

  async function createFirstProject(e: React.FormEvent) {
    e.preventDefault();
    if (!projectName.trim()) {
      setStepIndex((i) => i + 1);
      return;
    }
    setProjectBusy(true);
    setProjectError(null);
    try {
      let clientId: string | undefined;
      if (clientName.trim()) {
        const client = await apiFetch<{ id: string }>("/clients", {
          method: "POST",
          body: JSON.stringify({ name: clientName.trim() }),
        });
        clientId = client.id;
      }
      await apiFetch("/projects", { method: "POST", body: JSON.stringify({ name: projectName.trim(), clientId }) });
      setProjectDone(true);
      setStepIndex((i) => i + 1);
    } catch (err) {
      setProjectError(err instanceof ApiError ? err.message : tc("error"));
    } finally {
      setProjectBusy(false);
    }
  }

  async function finish() {
    setFinishing(true);
    setFinishError(null);
    try {
      await apiFetch("/company/complete-onboarding", { method: "POST" });
      router.replace("/dashboard");
    } catch (err) {
      setFinishError(err instanceof ApiError ? err.message : tc("error"));
      setFinishing(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-12">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex gap-1.5">
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={`h-1.5 w-8 rounded-full ${i <= stepIndex ? "bg-brand-500" : "bg-gray-200"}`}
            />
          ))}
        </div>
        {step !== "done" && (
          <button onClick={finish} disabled={finishing} className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700">
            {t("skipSetup")}
          </button>
        )}
      </div>
      {finishError && <p className="mb-4 text-sm text-error-700 dark:text-error-500">{finishError}</p>}

      <div className="card">
        {step === "catalog" && (
          <>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-50">{t("catalogTitle")}</h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{t("catalogHint")}</p>

            {catalogState === "done" && catalogResult && (
              <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
                {t("catalogLoaded", { materials: catalogResult.materialsCreated, items: catalogResult.rateItemsCreated })}
              </p>
            )}
            {catalogState === "error" && (
              <p className="mt-4 rounded-md bg-red-50 dark:bg-red-500/15 px-3 py-2 text-sm text-red-700 dark:text-red-400">{t("catalogError")}</p>
            )}

            <div className="mt-6 flex justify-between">
              {catalogState === "done" ? (
                <span />
              ) : (
                <button onClick={loadStarterCatalog} disabled={catalogState === "loading"} className="btn-secondary">
                  {catalogState === "loading" ? tc("loading") : t("loadCatalogButton")}
                </button>
              )}
              <button onClick={() => setStepIndex(1)} className="btn-primary">
                {t("continueButton")}
              </button>
            </div>
          </>
        )}

        {step === "invite" && (
          <>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-50">{t("inviteTitle")}</h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{t("inviteHint")}</p>

            {invitedEmails.length > 0 && (
              <ul className="mt-4 space-y-1 text-sm text-gray-700 dark:text-gray-200">
                {invitedEmails.map((email) => (
                  <li key={email} className="rounded-md bg-gray-50 dark:bg-gray-700 px-3 py-1.5">
                    {email}
                  </li>
                ))}
              </ul>
            )}
            {inviteError && <p className="mt-3 rounded-md bg-red-50 dark:bg-red-500/15 px-3 py-2 text-sm text-red-700 dark:text-red-400">{inviteError}</p>}

            <form onSubmit={sendInvite} className="mt-4 flex flex-wrap items-end gap-2">
              <input
                required
                type="email"
                placeholder={t("inviteEmailPlaceholder")}
                className="input w-auto flex-1"
                value={inviteForm.email}
                onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))}
              />
              <select
                className="input w-auto"
                value={inviteForm.role}
                onChange={(e) => setInviteForm((f) => ({ ...f, role: e.target.value }))}
              >
                {MEMBERSHIP_ROLES_MANAGEABLE.map((r) => (
                  <option key={r} value={r}>
                    {t(`role.${r}`)}
                  </option>
                ))}
              </select>
              <button type="submit" disabled={inviteBusy} className="btn-secondary">
                {t("sendInviteButton")}
              </button>
            </form>

            <div className="mt-6 flex justify-between">
              <button onClick={() => setStepIndex(0)} className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700">
                {t("back")}
              </button>
              <button onClick={() => setStepIndex(2)} className="btn-primary">
                {t("continueButton")}
              </button>
            </div>
          </>
        )}

        {step === "project" && (
          <>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-50">{t("projectTitle")}</h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{t("projectHint")}</p>

            {projectError && <p className="mt-4 rounded-md bg-red-50 dark:bg-red-500/15 px-3 py-2 text-sm text-red-700 dark:text-red-400">{projectError}</p>}

            <form onSubmit={createFirstProject} className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">{t("clientNameLabel")}</label>
                <input
                  className="input"
                  placeholder={t("clientNamePlaceholder")}
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">{t("projectNameLabel")}</label>
                <input
                  className="input"
                  placeholder={t("projectNamePlaceholder")}
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                />
              </div>

              <div className="flex justify-between pt-2">
                <button type="button" onClick={() => setStepIndex(1)} className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700">
                  {t("back")}
                </button>
                <button type="submit" disabled={projectBusy} className="btn-primary">
                  {projectBusy ? tc("loading") : projectName.trim() ? t("createAndContinueButton") : t("continueButton")}
                </button>
              </div>
            </form>
          </>
        )}

        {step === "done" && (
          <>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-50">{t("doneTitle")}</h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
              {projectDone ? t("doneHintWithProject") : t("doneHint")}
            </p>
            <button onClick={finish} disabled={finishing} className="btn-primary mt-6">
              {finishing ? tc("loading") : t("finishButton")}
            </button>
          </>
        )}
      </div>
    </main>
  );
}
