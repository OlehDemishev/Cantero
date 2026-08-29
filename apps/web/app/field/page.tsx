"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { EXPENSE_CATEGORIES, RFI_PRIORITIES, WEATHER_CONDITIONS, type ExpenseCategory, type RfiPriority, type WeatherCondition } from "@cantero/shared";
import { apiUpload, clearToken, getToken } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";
import { submitOrQueue, submitOrQueueUpload, useOfflineQueue } from "@/lib/offline-queue";
import { fetchCached, updateCache } from "@/lib/offline-cache";
import { DashboardIcon, LogoutIcon } from "@/components/nav-icons";
import { OfflineConflictsBanner } from "@/components/offline-conflicts-banner";
import { VoiceInputButton } from "@/components/voice-input-button";

/** Best-effort current position — resolves null (never rejects) on denial, timeout, or an unsupported browser, so logging time never blocks on location. */
function getCurrentPositionSafe(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 8000, maximumAge: 60_000 },
    );
  });
}

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
  const { pendingCount, failedItems, refresh: refreshQueue } = useOfflineQueue();
  const [online, setOnline] = useState(true);

  const [projects, setProjects] = useState<Project[] | null>(null);
  const [projectsError, setProjectsError] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [tab, setTab] = useState<"tasks" | "time" | "stock" | "logs" | "punch" | "rfi" | "expenses">("tasks");

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

      <OfflineConflictsBanner items={failedItems} onChange={refreshQueue} />

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

            <div className="mt-4 grid grid-cols-4 gap-1 rounded-lg bg-gray-100 p-1">
              {(["tasks", "time", "stock", "logs", "punch", "rfi", "expenses"] as const).map((key) => (
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
              {tab === "rfi" && <RfiTab projectId={projectId} />}
              {tab === "expenses" && <ExpensesTab projectId={projectId} meUserId={me.user.id} />}
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
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const cacheKey = `field:tasks:${projectId}`;

  useEffect(() => {
    setTasks(null);
    setError(false);
    setCachedAt(null);
    fetchCached<Task[]>(cacheKey, `/tasks?projectId=${projectId}`)
      .then(({ data, stale, cachedAt: at }) => {
        setTasks(data);
        setCachedAt(stale ? at : null);
      })
      .catch(() => setError(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function advance(task: Task) {
    const next = STATUS_ORDER[(STATUS_ORDER.indexOf(task.status) + 1) % STATUS_ORDER.length];
    const updated = (tasks ?? []).map((x) => (x.id === task.id ? { ...x, status: next } : x));
    setTasks(updated);
    updateCache(cacheKey, updated).catch(() => {});
    await submitOrQueue("task-status", `/tasks/${task.id}`, "PATCH", { status: next });
  }

  if (error) return <p className="text-sm text-gray-400">{t("offline")}</p>;
  if (!tasks) return <p className="text-sm text-gray-400">{tc("loading")}</p>;
  if (tasks.length === 0) return <p className="text-sm text-gray-400">{t("noTasks")}</p>;

  return (
    <div>
      <CachedNote cachedAt={cachedAt} />
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

function CachedNote({ cachedAt }: { cachedAt: number | null }) {
  const t = useTranslations("field");
  if (cachedAt == null) return null;
  return <p className="mb-2 text-xs text-warning-700">{t("cachedFrom", { time: new Date(cachedAt).toLocaleTimeString() })}</p>;
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
  const [outsideGeofence, setOutsideGeofence] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetchCached<Worker[]>("field:workers", "/workers")
      .then(({ data: list }) => {
        setWorkers(list);
        const mine = list.find((w) => w.userId === meUserId);
        setForm((f) => ({ ...f, workerId: (mine ?? list[0])?.id ?? "" }));
      })
      .catch(() => setError(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meUserId]);

  useEffect(() => {
    fetchCached<Task[]>(`field:tasks:${projectId}`, `/tasks?projectId=${projectId}`)
      .then(({ data }) => setTasks(data))
      .catch(() => setError(true));
    setForm((f) => ({ ...f, taskId: "" }));
  }, [projectId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.workerId) return;
    setBusy(true);
    setMessage(null);
    setOutsideGeofence(false);
    try {
      const position = await getCurrentPositionSafe();
      const { queued, data } = await submitOrQueue<{ withinGeofence: boolean | null }>("time-entry", "/time-entries", "POST", {
        workerId: form.workerId,
        projectId,
        taskId: form.taskId || undefined,
        hours: Number(form.hours),
        date: new Date(form.date).toISOString(),
        clockInLat: position?.lat,
        clockInLng: position?.lng,
      });
      if (queued) {
        setMessage(t("queuedOffline"));
      } else if (data?.withinGeofence === false) {
        setMessage(t("loggedOutsideGeofence"));
        setOutsideGeofence(true);
      } else {
        setMessage(tc("saved"));
      }
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
      {message && <p className={`text-xs ${outsideGeofence ? "text-warning-700" : "text-success-700"}`}>{message}</p>}
    </form>
  );
}

interface ReceiptExtraction {
  amount: number | null;
  incurredAt: string | null;
  vendorGuess: string | null;
}

function ExpensesTab({ projectId, meUserId }: { projectId: string; meUserId: string }) {
  const t = useTranslations("field");
  const tt = useTranslations("team");
  const te = useTranslations("expenses");
  const tc = useTranslations("common");
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [form, setForm] = useState({
    workerId: "",
    category: "materials" as ExpenseCategory,
    amount: "",
    description: "",
    incurredAt: new Date().toISOString().slice(0, 10),
  });
  const [receipt, setReceipt] = useState<File | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);

  async function scanReceipt() {
    if (!receipt) return;
    setScanning(true);
    setScanMessage(null);
    try {
      const result = await apiUpload<ReceiptExtraction>("/expenses/scan-receipt", receipt);
      if (result.amount === null && result.incurredAt === null && result.vendorGuess === null) {
        setScanMessage(t("scanReceiptNoData"));
        return;
      }
      setForm((f) => ({
        ...f,
        amount: result.amount !== null ? String(result.amount) : f.amount,
        incurredAt: result.incurredAt ? result.incurredAt.slice(0, 10) : f.incurredAt,
        description: !f.description && result.vendorGuess ? result.vendorGuess : f.description,
      }));
      setScanMessage(t("scanReceiptDone"));
    } catch {
      setScanMessage(t("scanReceiptFailed"));
    } finally {
      setScanning(false);
    }
  }

  useEffect(() => {
    fetchCached<Worker[]>("field:workers", "/workers")
      .then(({ data: list }) => {
        setWorkers(list);
        const mine = list.find((w) => w.userId === meUserId);
        setForm((f) => ({ ...f, workerId: (mine ?? list[0])?.id ?? "" }));
      })
      .catch(() => setError(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meUserId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.workerId || !form.amount) return;
    setBusy(true);
    setMessage(null);
    try {
      const { queued, data } = await submitOrQueue<{ id: string }>("expense", "/expenses", "POST", {
        projectId,
        workerId: form.workerId,
        category: form.category,
        amount: Number(form.amount),
        description: form.description || undefined,
        incurredAt: new Date(form.incurredAt).toISOString(),
      });
      if (queued) {
        // The expense record itself doesn't exist on the server yet, so there's nothing to attach
        // a receipt to — queuing a dependent upload against an id that doesn't exist yet isn't supported.
        setMessage(receipt ? t("queuedOfflineNoReceipt") : t("queuedOffline"));
      } else {
        let resultMessage = te("submitted");
        if (receipt && data?.id) {
          try {
            const { queued: receiptQueued } = await submitOrQueueUpload("expense-receipt", `/expenses/${data.id}/receipt`, receipt);
            if (receiptQueued) resultMessage = t("receiptQueuedOffline");
          } catch {
            // The expense itself is already saved — a failed receipt upload shouldn't look like the whole submission failed.
          }
        }
        setMessage(resultMessage);
      }
      setForm((f) => ({ ...f, amount: "", description: "" }));
      setReceipt(null);
      setScanMessage(null);
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
        <span className="font-medium text-gray-700">{te("category")}</span>
        <select
          className="input"
          value={form.category}
          onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as ExpenseCategory }))}
        >
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {te(c)}
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1.5 text-sm">
          <span className="font-medium text-gray-700">{te("amount")}</span>
          <input
            required
            type="number"
            step="0.01"
            min="0.01"
            className="input"
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
          />
        </label>
        <label className="flex flex-1 flex-col gap-1.5 text-sm">
          <span className="font-medium text-gray-700">{te("date")}</span>
          <input
            type="date"
            className="input"
            value={form.incurredAt}
            onChange={(e) => setForm((f) => ({ ...f, incurredAt: e.target.value }))}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-gray-700">{te("description")}</span>
        <input
          className="input"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-gray-700">{te("receipt")}</span>
        <input
          type="file"
          accept="image/*,application/pdf"
          className="input"
          onChange={(e) => {
            setReceipt(e.target.files?.[0] ?? null);
            setScanMessage(null);
          }}
        />
      </label>
      {receipt && (
        <div className="flex items-center gap-2">
          <button type="button" onClick={scanReceipt} disabled={scanning} className="btn-secondary px-3 py-1 text-xs">
            {scanning ? t("scanReceiptScanning") : t("scanReceiptButton")}
          </button>
          {scanMessage && <span className="text-xs text-gray-500">{scanMessage}</span>}
        </div>
      )}
      <button type="submit" disabled={busy} className="btn-primary mt-1">
        {te("submit")}
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
    fetchCached<Warehouse[]>("field:warehouses", "/materials/warehouses")
      .then(({ data: list }) => {
        setWarehouses(list);
        setForm((f) => ({ ...f, warehouseId: list[0]?.id ?? "" }));
      })
      .catch(() => setError(true));
    fetchCached<MaterialCatalogItem[]>("field:materials", "/materials/catalog")
      .then(({ data: list }) => {
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
  const [cachedAt, setCachedAt] = useState<number | null>(null);

  useEffect(() => {
    setLoaded(false);
    setExistingId(null);
    setCachedAt(null);
    setForm({ weatherCondition: "", crewCount: "", workPerformed: "", delays: "" });
    fetchCached<DailyLog[]>(`field:daily-logs:${projectId}`, `/daily-logs?projectId=${projectId}`)
      .then(({ data: list, stale, cachedAt: at }) => {
        setCachedAt(stale ? at : null);
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
      .catch(() => {})
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
      <CachedNote cachedAt={cachedAt} />
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
        <span className="flex items-center gap-2 font-medium text-gray-700">
          {td("workPerformed")}
          <VoiceInputButton
            onTranscript={(text) => setForm((f) => ({ ...f, workPerformed: f.workPerformed ? `${f.workPerformed} ${text}` : text }))}
          />
        </span>
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
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const cacheKey = `field:punch-list:${projectId}`;

  function load() {
    fetchCached<PunchListItem[]>(cacheKey, `/punch-list?projectId=${projectId}`)
      .then(({ data, stale, cachedAt: at }) => {
        setItems(data);
        setCachedAt(stale ? at : null);
      })
      .catch(() => setItems(null));
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
      if (queued) {
        const optimistic: PunchListItem = { id: `queued-${Date.now()}`, title: form.title, location: form.location || null, status: "open" };
        const updated = [...(items ?? []), optimistic];
        setItems(updated);
        updateCache(cacheKey, updated).catch(() => {});
      }
      setForm({ title: "", location: "" });
      if (!queued) load();
    } finally {
      setBusy(false);
    }
  }

  async function resolve(id: string) {
    const { queued } = await submitOrQueue("punch-list-resolve", `/punch-list/${id}/resolve`, "POST", {});
    if (queued) {
      const updated = (items ?? []).map((i) => (i.id === id ? { ...i, status: "resolved" as const } : i));
      setItems(updated);
      updateCache(cacheKey, updated).catch(() => {});
    } else {
      load();
    }
  }

  const openAndResolved = (items ?? []).filter((i) => i.status !== "verified");

  return (
    <div className="flex flex-col gap-4">
      <CachedNote cachedAt={cachedAt} />
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

interface FieldRfi {
  id: string;
  number: string;
  subject: string;
  status: "open" | "answered" | "closed";
  priority: RfiPriority;
}

const RFI_STATUS_STYLES: Record<FieldRfi["status"], string> = {
  open: "bg-warning-50 text-warning-700",
  answered: "bg-brand-50 text-brand-700",
  closed: "bg-success-50 text-success-700",
};

function RfiTab({ projectId }: { projectId: string }) {
  const t = useTranslations("field");
  const tr = useTranslations("rfi");
  const tc = useTranslations("common");
  const [items, setItems] = useState<FieldRfi[] | null>(null);
  const [form, setForm] = useState({ subject: "", question: "", priority: "medium" as RfiPriority });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const cacheKey = `field:rfis:${projectId}`;

  function load() {
    fetchCached<FieldRfi[]>(cacheKey, `/rfis?projectId=${projectId}`)
      .then(({ data, stale, cachedAt: at }) => {
        setItems(data);
        setCachedAt(stale ? at : null);
      })
      .catch(() => setItems(null));
  }

  useEffect(load, [projectId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.subject || !form.question) return;
    setBusy(true);
    setMessage(null);
    try {
      const { queued } = await submitOrQueue("rfi", "/rfis", "POST", {
        projectId,
        subject: form.subject,
        question: form.question,
        priority: form.priority,
      });
      setMessage(queued ? t("queuedOffline") : tc("saved"));
      if (queued) {
        const optimistic: FieldRfi = { id: `queued-${Date.now()}`, number: "—", subject: form.subject, status: "open", priority: form.priority };
        const updated = [...(items ?? []), optimistic];
        setItems(updated);
        updateCache(cacheKey, updated).catch(() => {});
      }
      setForm({ subject: "", question: "", priority: "medium" });
      if (!queued) load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <CachedNote cachedAt={cachedAt} />
      <form onSubmit={submit} className="card flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-gray-700">{tr("subject")}</span>
          <input required className="input" value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="flex items-center gap-2 font-medium text-gray-700">
            {tr("question")}
            <VoiceInputButton onTranscript={(text) => setForm((f) => ({ ...f, question: f.question ? `${f.question} ${text}` : text }))} />
          </span>
          <textarea required rows={3} className="input" value={form.question} onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-gray-700">{tr("priority")}</span>
          <select className="input" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as RfiPriority }))}>
            {RFI_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {tr(p)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={busy} className="btn-primary">
          {tr("newRfi")}
        </button>
        {message && <p className="text-xs text-success-700">{message}</p>}
      </form>

      {items === null ? (
        <p className="text-sm text-gray-400">{tc("loading")}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-400">{tr("noItems")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="card flex items-center justify-between">
              <div>
                <div className="text-xs font-mono text-gray-400">{item.number}</div>
                <div className="text-sm font-medium text-gray-900">{item.subject}</div>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${RFI_STATUS_STYLES[item.status]}`}>{tr(item.status)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
