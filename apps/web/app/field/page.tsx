"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { WEATHER_CONDITIONS, type WeatherCondition } from "@cantero/shared";
import { apiFetch, clearToken, getToken } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";
import { submitOrQueue, useOfflineQueue } from "@/lib/offline-queue";
import { DashboardIcon, LogoutIcon } from "@/components/nav-icons";

type TaskStatus = "planned" | "in_progress" | "done";
const STATUS_ORDER: TaskStatus[] = ["planned", "in_progress", "done"];

interface Project {
  id: string;
  name: string;
}
interface Task {
  id: string;
  name: string;
  status: TaskStatus;
}
interface Worker {
  id: string;
  name: string;
  userId: string | null;
}
interface Warehouse {
  id: string;
  name: string;
}
interface MaterialCatalogItem {
  id: string;
  code: string;
  name: string;
  unit: string;
}

const PROJECT_STORAGE_KEY = "cantero_field_project";

export default function FieldPage() {
  const t = useTranslations("field");
  const tc = useTranslations("common");
  const router = useRouter();
  const { data: me, loading: meLoading } = useMe();
  const { pendingCount } = useOfflineQueue();
  const [online, setOnline] = useState(true);

  const [projects, setProjects] = useState<Project[] | null>(null);
  const [projectsError, setProjectsError] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [tab, setTab] = useState<"tasks" | "time" | "stock" | "logs" | "punch">("tasks");

  useEffect(() => {
    if (!getToken()) router.replace("/login");
  }, [router]);

  useEffect(() => {
    setOnline(navigator.onLine);
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
    apiFetch<Project[]>("/projects")
      .then((list) => {
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
    return <div className="flex min-h-screen items-center justify-center text-gray-500">{tc("loading")}</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white pt-[env(safe-area-inset-top)]">
        <div className="flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-sm font-semibold text-white">
              C
            </span>
            <span className="text-sm font-semibold text-gray-900">{t("title")}</span>
          </div>
          <div className="flex items-center gap-1">
            {pendingCount > 0 && (
              <span className="mr-1 rounded-full bg-warning-50 px-2.5 py-1 text-xs font-medium text-warning-700">
                {t("pendingSync", { count: pendingCount })}
              </span>
            )}
            <a
              href="/dashboard"
              aria-label={t("backToDashboard")}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
            >
              <DashboardIcon />
            </a>
            <button
              onClick={signOut}
              aria-label={tc("signOut")}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
            >
              <LogoutIcon />
            </button>
          </div>
        </div>
        {!online && (
          <div className="bg-warning-50 px-4 py-1.5 text-center text-xs font-medium text-warning-700">{t("offline")}</div>
        )}
      </header>

      <div className="mx-auto max-w-lg px-4 py-4">
        {projectsError ? (
          <p className="text-sm text-gray-500">{t("offline")}</p>
        ) : !projects || projects.length === 0 ? (
          <p className="text-sm text-gray-500">{t("noProjects")}</p>
        ) : (
          <>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700">{t("project")}</span>
              <select className="input" value={projectId} onChange={(e) => selectProject(e.target.value)}>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="mt-4 grid grid-cols-5 gap-1 rounded-lg bg-gray-100 p-1">
              {(["tasks", "time", "stock", "logs", "punch"] as const).map((key) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`rounded-md py-2 text-xs font-medium transition ${
                    tab === key ? "bg-white text-gray-900 shadow-theme-xs" : "text-gray-500"
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
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function TasksTab({ projectId }: { projectId: string }) {
  const t = useTranslations("field");
  const tc = useTranslations("common");
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setTasks(null);
    setError(false);
    apiFetch<Task[]>(`/tasks?projectId=${projectId}`)
      .then(setTasks)
      .catch(() => setError(true));
  }, [projectId]);

  async function advance(task: Task) {
    const next = STATUS_ORDER[(STATUS_ORDER.indexOf(task.status) + 1) % STATUS_ORDER.length];
    setTasks((prev) => prev && prev.map((x) => (x.id === task.id ? { ...x, status: next } : x)));
    await submitOrQueue("task-status", `/tasks/${task.id}`, "PATCH", { status: next });
  }

  if (error) return <p className="text-sm text-gray-400">{t("offline")}</p>;
  if (!tasks) return <p className="text-sm text-gray-400">{tc("loading")}</p>;
  if (tasks.length === 0) return <p className="text-sm text-gray-400">{t("noTasks")}</p>;

  return (
    <div>
      <p className="mb-3 text-xs text-gray-500">{t("tapToAdvance")}</p>
      <ul className="flex flex-col gap-2">
        {tasks.map((task) => (
          <li key={task.id}>
            <button onClick={() => advance(task)} className="card flex w-full items-center justify-between text-left">
              <span className="text-sm font-medium text-gray-900">{task.name}</span>
              <StatusBadge status={task.status} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusBadge({ status }: { status: TaskStatus }) {
  const ts = useTranslations("scheduling");
  const styles: Record<TaskStatus, string> = {
    planned: "bg-gray-100 text-gray-600",
    in_progress: "bg-warning-50 text-warning-700",
    done: "bg-success-50 text-success-700",
  };
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${styles[status]}`}>{ts(status)}</span>;
}

function TimeTab({ projectId, meUserId }: { projectId: string; meUserId: string }) {
  const t = useTranslations("field");
  const tt = useTranslations("team");
  const tc = useTranslations("common");
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [form, setForm] = useState({ workerId: "", taskId: "", hours: "8", date: new Date().toISOString().slice(0, 10) });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    apiFetch<Worker[]>("/workers")
      .then((list) => {
        setWorkers(list);
        const mine = list.find((w) => w.userId === meUserId);
        setForm((f) => ({ ...f, workerId: (mine ?? list[0])?.id ?? "" }));
      })
      .catch(() => setError(true));
  }, [meUserId]);

  useEffect(() => {
    apiFetch<Task[]>(`/tasks?projectId=${projectId}`)
      .then(setTasks)
      .catch(() => setError(true));
    setForm((f) => ({ ...f, taskId: "" }));
  }, [projectId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.workerId) return;
    setBusy(true);
    setMessage(null);
    try {
      const { queued } = await submitOrQueue("time-entry", "/time-entries", "POST", {
        workerId: form.workerId,
        projectId,
        taskId: form.taskId || undefined,
        hours: Number(form.hours),
        date: new Date(form.date).toISOString(),
      });
      setMessage(queued ? t("queuedOffline") : tc("saved"));
      setForm((f) => ({ ...f, hours: "8" }));
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="text-sm text-gray-400">{t("offline")}</p>;
  if (workers.length === 0) return <p className="text-sm text-gray-400">{tc("loading")}</p>;

  return (
    <form onSubmit={submit} className="card flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-gray-700">{tt("worker")}</span>
        <select className="input" value={form.workerId} onChange={(e) => setForm((f) => ({ ...f, workerId: e.target.value }))}>
          {workers.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-gray-700">{tt("task")}</span>
        <select className="input" value={form.taskId} onChange={(e) => setForm((f) => ({ ...f, taskId: e.target.value }))}>
          <option value="">{tt("noneTask")}</option>
          {tasks.map((task) => (
            <option key={task.id} value={task.id}>
              {task.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1.5 text-sm">
          <span className="font-medium text-gray-700">{tt("hours")}</span>
          <input
            type="number"
            step="0.25"
            min="0.25"
            max="24"
            className="input"
            value={form.hours}
            onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))}
          />
        </label>
        <label className="flex flex-1 flex-col gap-1.5 text-sm">
          <span className="font-medium text-gray-700">{tt("date")}</span>
          <input
            type="date"
            className="input"
            value={form.date}
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
          />
        </label>
      </div>
      <button type="submit" disabled={busy} className="btn-primary mt-1">
        {t("logTimeButton")}
      </button>
      {message && <p className="text-xs text-success-700">{message}</p>}
    </form>
  );
}

function StockTab({ projectId }: { projectId: string }) {
  const t = useTranslations("field");
  const tw = useTranslations("warehouses");
  const tc = useTranslations("common");
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [materials, setMaterials] = useState<MaterialCatalogItem[]>([]);
  const [form, setForm] = useState({ warehouseId: "", materialCatalogItemId: "", quantity: "1", type: "issue" as "issue" | "receipt" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    apiFetch<Warehouse[]>("/materials/warehouses")
      .then((list) => {
        setWarehouses(list);
        setForm((f) => ({ ...f, warehouseId: list[0]?.id ?? "" }));
      })
      .catch(() => setError(true));
    apiFetch<MaterialCatalogItem[]>("/materials/catalog")
      .then((list) => {
        setMaterials(list);
        setForm((f) => ({ ...f, materialCatalogItemId: list[0]?.id ?? "" }));
      })
      .catch(() => setError(true));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.warehouseId || !form.materialCatalogItemId) return;
    setBusy(true);
    setMessage(null);
    try {
      const { queued } = await submitOrQueue("stock-movement", "/materials/stock/movements", "POST", {
        warehouseId: form.warehouseId,
        materialCatalogItemId: form.materialCatalogItemId,
        type: form.type,
        quantity: Number(form.quantity),
        projectId,
      });
      setMessage(queued ? t("queuedOffline") : tc("saved"));
      setForm((f) => ({ ...f, quantity: "1" }));
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="text-sm text-gray-400">{t("offline")}</p>;
  if (warehouses.length === 0 || materials.length === 0) return <p className="text-sm text-gray-400">{tc("loading")}</p>;

  return (
    <form onSubmit={submit} className="card flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-gray-700">{tw("title")}</span>
        <select
          className="input"
          value={form.warehouseId}
          onChange={(e) => setForm((f) => ({ ...f, warehouseId: e.target.value }))}
        >
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-gray-700">{tw("material")}</span>
        <select
          className="input"
          value={form.materialCatalogItemId}
          onChange={(e) => setForm((f) => ({ ...f, materialCatalogItemId: e.target.value }))}
        >
          {materials.map((m) => (
            <option key={m.id} value={m.id}>
              {m.code} — {m.name} ({m.unit})
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1.5 text-sm">
          <span className="font-medium text-gray-700">{tw("type")}</span>
          <select
            className="input"
            value={form.type}
            onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as "issue" | "receipt" }))}
          >
            <option value="issue">{tw("issue")}</option>
            <option value="receipt">{tw("receipt")}</option>
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1.5 text-sm">
          <span className="font-medium text-gray-700">{t("quantity")}</span>
          <input
            type="number"
            step="0.01"
            min="0.01"
            className="input"
            value={form.quantity}
            onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
          />
        </label>
      </div>
      <button type="submit" disabled={busy} className="btn-primary mt-1">
        {t("issueStockButton")}
      </button>
      {message && <p className="text-xs text-success-700">{message}</p>}
    </form>
  );
}

interface DailyLog {
  id: string;
  date: string;
  weatherCondition: WeatherCondition | null;
  crewCount: number | null;
  workPerformed: string;
  delays: string | null;
}

const TODAY = new Date().toISOString().slice(0, 10);

function LogsTab({ projectId }: { projectId: string }) {
  const t = useTranslations("field");
  const td = useTranslations("dailyLogs");
  const tc = useTranslations("common");
  const [existingId, setExistingId] = useState<string | null>(null);
  const [form, setForm] = useState({ weatherCondition: "" as WeatherCondition | "", crewCount: "", workPerformed: "", delays: "" });
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setLoaded(false);
    setExistingId(null);
    setForm({ weatherCondition: "", crewCount: "", workPerformed: "", delays: "" });
    apiFetch<DailyLog[]>(`/daily-logs?projectId=${projectId}`)
      .then((list) => {
        const today = list.find((l) => l.date.slice(0, 10) === TODAY);
        if (today) {
          setExistingId(today.id);
          setForm({
            weatherCondition: today.weatherCondition ?? "",
            crewCount: today.crewCount?.toString() ?? "",
            workPerformed: today.workPerformed,
            delays: today.delays ?? "",
          });
        }
      })
      .finally(() => setLoaded(true));
  }, [projectId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const body = {
      weatherCondition: form.weatherCondition || undefined,
      crewCount: form.crewCount ? Number(form.crewCount) : undefined,
      workPerformed: form.workPerformed,
      delays: form.delays || undefined,
    };
    try {
      const { queued } = existingId
        ? await submitOrQueue("daily-log", `/daily-logs/${existingId}`, "PATCH", body)
        : await submitOrQueue("daily-log", "/daily-logs", "POST", { ...body, projectId, date: new Date().toISOString() });
      setMessage(queued ? t("queuedOffline") : tc("saved"));
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return <p className="text-sm text-gray-400">{tc("loading")}</p>;

  return (
    <form onSubmit={submit} className="card flex flex-col gap-3">
      <p className="text-xs text-gray-500">{new Date().toLocaleDateString()}</p>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-gray-700">{td("weather")}</span>
        <select
          className="input"
          value={form.weatherCondition}
          onChange={(e) => setForm((f) => ({ ...f, weatherCondition: e.target.value as WeatherCondition | "" }))}
        >
          <option value="">{tc("none")}</option>
          {WEATHER_CONDITIONS.map((w) => (
            <option key={w} value={w}>
              {td(`weather_${w}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-gray-700">{td("crewCount")}</span>
        <input
          type="number"
          min="0"
          className="input"
          value={form.crewCount}
          onChange={(e) => setForm((f) => ({ ...f, crewCount: e.target.value }))}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-gray-700">{td("workPerformed")}</span>
        <textarea
          required
          rows={3}
          className="input"
          value={form.workPerformed}
          onChange={(e) => setForm((f) => ({ ...f, workPerformed: e.target.value }))}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-gray-700">{td("delays")}</span>
        <textarea
          rows={2}
          className="input"
          value={form.delays}
          onChange={(e) => setForm((f) => ({ ...f, delays: e.target.value }))}
        />
      </label>
      <button type="submit" disabled={busy} className="btn-primary mt-1">
        {existingId ? tc("save") : td("newLog")}
      </button>
      {message && <p className="text-xs text-success-700">{message}</p>}
    </form>
  );
}

interface PunchListItem {
  id: string;
  title: string;
  location: string | null;
  status: "open" | "resolved" | "verified";
}

function PunchTab({ projectId }: { projectId: string }) {
  const t = useTranslations("field");
  const tp = useTranslations("punchList");
  const tc = useTranslations("common");
  const [items, setItems] = useState<PunchListItem[] | null>(null);
  const [form, setForm] = useState({ title: "", location: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function load() {
    apiFetch<PunchListItem[]>(`/punch-list?projectId=${projectId}`).then(setItems).catch(() => setItems(null));
  }

  useEffect(load, [projectId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title) return;
    setBusy(true);
    setMessage(null);
    try {
      const { queued } = await submitOrQueue("punch-list-item", "/punch-list", "POST", {
        projectId,
        title: form.title,
        location: form.location || undefined,
      });
      setMessage(queued ? t("queuedOffline") : tc("saved"));
      setForm({ title: "", location: "" });
      if (!queued) load();
    } finally {
      setBusy(false);
    }
  }

  async function resolve(id: string) {
    const { queued } = await submitOrQueue("punch-list-resolve", `/punch-list/${id}/resolve`, "POST", {});
    if (!queued) load();
  }

  const openAndResolved = (items ?? []).filter((i) => i.status !== "verified");

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={submit} className="card flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-gray-700">{tp("itemTitle")}</span>
          <input
            required
            className="input"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-gray-700">{tp("location")}</span>
          <input
            className="input"
            placeholder={tp("locationPlaceholder")}
            value={form.location}
            onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
          />
        </label>
        <button type="submit" disabled={busy} className="btn-primary">
          {tp("newItem")}
        </button>
        {message && <p className="text-xs text-success-700">{message}</p>}
      </form>

      {items === null ? (
        <p className="text-sm text-gray-400">{tc("loading")}</p>
      ) : openAndResolved.length === 0 ? (
        <p className="text-sm text-gray-400">{tp("noItems")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {openAndResolved.map((item) => (
            <li key={item.id} className="card flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-gray-900">{item.title}</div>
                {item.location && <div className="text-xs text-gray-500">{item.location}</div>}
              </div>
              {item.status === "open" ? (
                <button onClick={() => resolve(item.id)} className="btn-secondary px-2.5 py-1 text-xs">
                  {tp("markResolved")}
                </button>
              ) : (
                <span className="rounded-full bg-warning-50 px-2.5 py-1 text-xs font-medium text-warning-700">
                  {tp("resolved")}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
