"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ApiError, apiFetch, clearToken, getToken } from "@/lib/api-client";

interface KioskWorker {
  id: string;
  name: string;
}
interface Project {
  id: string;
  name: string;
}

export default function KioskPage() {
  const t = useTranslations("kiosk");
  const tc = useTranslations("common");
  const router = useRouter();

  const [workers, setWorkers] = useState<KioskWorker[] | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedWorker, setSelectedWorker] = useState<KioskWorker | null>(null);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [entryForm, setEntryForm] = useState({ projectId: "", hours: "8" });
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    // A stored token the API now rejects (expired, or from a database that's since been reset)
    // would otherwise leave `workers` null forever and this page stuck on its loading state.
    function handleAuthFailure(err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        clearToken();
        router.replace("/login");
        return;
      }
      throw err;
    }
    apiFetch<KioskWorker[]>("/workers/kiosk").then(setWorkers).catch(handleAuthFailure);
    apiFetch<Project[]>("/projects").then(setProjects).catch(handleAuthFailure);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pickWorker(worker: KioskWorker) {
    setSelectedWorker(worker);
    setPin("");
    setPinError(null);
    setVerified(false);
    setDone(false);
  }

  function reset() {
    setSelectedWorker(null);
    setPin("");
    setPinError(null);
    setVerified(false);
    setDone(false);
    setEntryForm({ projectId: "", hours: "8" });
  }

  async function submitPin() {
    if (!selectedWorker || pin.length < 4) return;
    setBusy(true);
    setPinError(null);
    try {
      const { valid } = await apiFetch<{ valid: boolean }>(`/workers/${selectedWorker.id}/verify-clock-in-pin`, {
        method: "POST",
        body: JSON.stringify({ pin }),
      });
      if (valid) {
        setVerified(true);
      } else {
        setPinError(t("wrongPin"));
        setPin("");
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedWorker || !entryForm.projectId) return;
    setBusy(true);
    try {
      await apiFetch("/time-entries", {
        method: "POST",
        body: JSON.stringify({
          workerId: selectedWorker.id,
          projectId: entryForm.projectId,
          hours: Number(entryForm.hours),
          date: new Date().toISOString(),
        }),
      });
      setDone(true);
      setTimeout(reset, 2500);
    } finally {
      setBusy(false);
    }
  }

  if (!workers) {
    return <div className="flex min-h-screen items-center justify-center text-gray-500">{tc("loading")}</div>;
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-gray-50 px-6 py-10">
      <h1 className="mb-8 text-2xl font-semibold text-gray-900">{t("title")}</h1>

      {!selectedWorker ? (
        <div className="grid w-full max-w-2xl grid-cols-2 gap-3 sm:grid-cols-3">
          {workers.length === 0 ? (
            <p className="col-span-full text-center text-sm text-gray-400">{t("noWorkers")}</p>
          ) : (
            workers.map((w) => (
              <button
                key={w.id}
                onClick={() => pickWorker(w)}
                className="card flex h-24 items-center justify-center px-3 text-center text-base font-medium text-gray-800 hover:border-brand-300"
              >
                {w.name}
              </button>
            ))
          )}
        </div>
      ) : (
        <div className="w-full max-w-sm">
          <div className="card">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">{selectedWorker.name}</h2>
              <button onClick={reset} className="text-xs text-gray-400 hover:underline">
                {tc("cancel")}
              </button>
            </div>

            {done ? (
              <p className="rounded-lg border border-success-200 bg-success-50 px-4 py-3 text-center text-sm text-success-700">
                {t("entrySaved")}
              </p>
            ) : !verified ? (
              <>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-gray-700">{t("enterPin")}</span>
                  <input
                    type="password"
                    inputMode="numeric"
                    autoFocus
                    maxLength={6}
                    className="input text-center text-xl tracking-widest"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  />
                </label>
                {pinError && <p className="mt-2 text-xs text-error-700">{pinError}</p>}
                <button onClick={submitPin} disabled={busy || pin.length < 4} className="btn-primary mt-4 w-full">
                  {t("submitPin")}
                </button>
              </>
            ) : (
              <form onSubmit={submitEntry} className="flex flex-col gap-3">
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-gray-700">{t("project")}</span>
                  <select
                    required
                    className="input"
                    value={entryForm.projectId}
                    onChange={(e) => setEntryForm((f) => ({ ...f, projectId: e.target.value }))}
                  >
                    <option value="">{t("selectProject")}</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-gray-700">{t("hours")}</span>
                  <input
                    type="number"
                    min="0.25"
                    max="24"
                    step="0.25"
                    className="input"
                    value={entryForm.hours}
                    onChange={(e) => setEntryForm((f) => ({ ...f, hours: e.target.value }))}
                  />
                </label>
                <button type="submit" disabled={busy || !entryForm.projectId} className="btn-primary mt-2">
                  {t("logHours")}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
