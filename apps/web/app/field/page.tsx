"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { clearToken, getToken } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";
import { useOfflineQueue } from "@/lib/offline-queue";
import { fetchCached } from "@/lib/offline-cache";
import { DashboardIcon, LogoutIcon } from "@/components/nav-icons";
import { OfflineConflictsBanner } from "@/components/offline-conflicts-banner";
import { TasksTab } from "@/components/field-tasks-tab";
import { TimeTab } from "@/components/field-time-tab";
import { ExpensesTab } from "@/components/field-expenses-tab";
import { StockTab } from "@/components/field-stock-tab";
import { LogsTab } from "@/components/field-logs-tab";
import { PunchTab } from "@/components/field-punch-tab";
import { RfiTab } from "@/components/field-rfi-tab";

interface Project {
  id: string;
  name: string;
}

const PROJECT_STORAGE_KEY = "cantero_field_project";

export default function FieldPage() {
  const t = useTranslations("field");
  const tc = useTranslations("common");
  const router = useRouter();
  const { data: me, loading: meLoading, unauthorized } = useMe();
  const { pendingCount, failedItems, refresh: refreshQueue } = useOfflineQueue();
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));

  const [projects, setProjects] = useState<Project[] | null>(null);
  const [projectsError, setProjectsError] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [tab, setTab] = useState<"tasks" | "time" | "stock" | "logs" | "punch" | "rfi" | "expenses">("tasks");

  useEffect(() => {
    if (!getToken()) router.replace("/login");
  }, [router]);

  useEffect(() => {
    // Mirrors AuthenticatedShell: a stored token the API now rejects would otherwise leave this
    // page stuck on the loading state forever, since `getToken()` above only catches a missing one.
    if (unauthorized) {
      clearToken();
      router.replace("/login");
    }
  }, [unauthorized, router]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    fetchCached<Project[]>("field:projects", "/projects")
      .then(({ data: list }) => {
        setProjects(list);
        const stored = localStorage.getItem(PROJECT_STORAGE_KEY);
        setProjectId(stored && list.some((p) => p.id === stored) ? stored : (list[0]?.id ?? ""));
      })
      .catch(() => setProjectsError(true));
  }, []);

  function selectProject(id: string) {
    setProjectId(id);
    localStorage.setItem(PROJECT_STORAGE_KEY, id);
  }

  function signOut() {
    clearToken();
    router.replace("/login");
  }

  if (meLoading || !me || (!projects && !projectsError)) {
    return <div className="flex min-h-screen items-center justify-center text-gray-500 dark:text-gray-400">{tc("loading")}</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-700">
      <header className="sticky top-0 z-30 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 pt-[env(safe-area-inset-top)]">
        <div className="flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-sm font-semibold text-white">
              C
            </span>
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-50">{t("title")}</span>
          </div>
          <div className="flex items-center gap-1">
            {pendingCount > 0 && (
              <span className="mr-1 rounded-full bg-warning-50 dark:bg-warning-500/15 px-2.5 py-1 text-xs font-medium text-warning-700 dark:text-warning-500">
                {t("pendingSync", { count: pendingCount })}
              </span>
            )}
            <a href="/field/kiosk" className="mr-1 text-xs font-medium text-brand-700 dark:text-brand-400 hover:underline">
              {t("kioskMode")}
            </a>
            <a
              href="/dashboard"
              aria-label={t("backToDashboard")}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5"
            >
              <DashboardIcon />
            </a>
            <button
              onClick={signOut}
              aria-label={tc("signOut")}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5"
            >
              <LogoutIcon />
            </button>
          </div>
        </div>
        {!online && (
          <div className="bg-warning-50 dark:bg-warning-500/15 px-4 py-1.5 text-center text-xs font-medium text-warning-700 dark:text-warning-500">{t("offline")}</div>
        )}
      </header>

      <OfflineConflictsBanner items={failedItems} onChange={refreshQueue} />

      <div className="mx-auto max-w-lg px-4 py-4">
        {projectsError ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("offline")}</p>
        ) : !projects || projects.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("noProjects")}</p>
        ) : (
          <>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-200">{t("project")}</span>
              <select className="input" value={projectId} onChange={(e) => selectProject(e.target.value)}>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="mt-4 grid grid-cols-4 gap-1 rounded-lg bg-gray-100 dark:bg-gray-700 p-1">
              {(["tasks", "time", "stock", "logs", "punch", "rfi", "expenses"] as const).map((key) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`rounded-md py-2 text-xs font-medium transition ${
                    tab === key ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-50 shadow-theme-xs" : "text-gray-500 dark:text-gray-400"
                  }`}
                >
                  {t(key)}
                </button>
              ))}
            </div>

            <div className="mt-4">
              {tab === "tasks" && <TasksTab projectId={projectId} />}
              {tab === "time" && <TimeTab projectId={projectId} meUserId={me.user.id} />}
              {tab === "stock" && <StockTab projectId={projectId} />}
              {tab === "logs" && <LogsTab projectId={projectId} />}
              {tab === "punch" && <PunchTab projectId={projectId} />}
              {tab === "rfi" && <RfiTab projectId={projectId} />}
              {tab === "expenses" && <ExpensesTab projectId={projectId} meUserId={me.user.id} />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
