"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { apiFetch } from "@/lib/api-client";
import { formatDate } from "@/lib/format-date";

interface Project {
  id: string;
  name: string;
}
interface ScheduleTask {
  id: string;
  name: string;
  status: "planned" | "in_progress" | "done";
  startDate: string | null;
  dueDate: string | null;
  isCritical: boolean;
}
interface ScheduleMilestone {
  id: string;
  name: string;
  dueDate: string | null;
}
interface ProjectSchedule {
  projectId: string;
  projectName: string;
  tasks: ScheduleTask[];
  milestones: ScheduleMilestone[];
}

const STATUS_STYLES: Record<ScheduleTask["status"], string> = {
  planned: "bg-gray-400",
  in_progress: "bg-warning-500",
  done: "bg-success-500",
};

export default function SchedulePage() {
  const t = useTranslations("schedule");
  const tc = useTranslations("common");

  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [schedules, setSchedules] = useState<ProjectSchedule[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch<Project[]>("/projects").then(setProjects);
  }, []);

  function toggle(projectId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }

  async function load() {
    if (selected.size === 0) {
      setSchedules(null);
      return;
    }
    setLoading(true);
    try {
      const list = await apiFetch<ProjectSchedule[]>(`/tasks/portfolio-schedule?projectIds=${[...selected].join(",")}`);
      setSchedules(list);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthenticatedShell>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mt-2 text-sm text-gray-500">{t("hint")}</p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {projects.map((p) => (
          <button
            key={p.id}
            onClick={() => toggle(p.id)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              selected.has(p.id) ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-600"
            }`}
          >
            {p.name}
          </button>
        ))}
        <button onClick={load} disabled={selected.size === 0 || loading} className="btn-primary px-3 py-1 text-xs">
          {t("loadSchedule")}
        </button>
      </div>

      <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full ring-2 ring-error-600" /> {t("criticalPath")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rotate-45 bg-brand-500" /> {t("milestone")}
        </span>
      </div>

      {loading ? (
        <p className="mt-6 text-sm text-gray-400">{tc("loading")}</p>
      ) : !schedules ? (
        <p className="mt-6 text-sm text-gray-400">{t("selectProjects")}</p>
      ) : (
        <div className="mt-6 flex flex-col gap-8">
          {schedules.map((s) => (
            <ProjectScheduleSection key={s.projectId} schedule={s} />
          ))}
        </div>
      )}
    </AuthenticatedShell>
  );
}

function ProjectScheduleSection({ schedule }: { schedule: ProjectSchedule }) {
  const t = useTranslations("schedule");

  const dated = schedule.tasks.filter((task) => task.startDate && task.dueDate);
  const dates = [
    ...dated.flatMap((task) => [new Date(task.startDate!).getTime(), new Date(task.dueDate!).getTime()]),
    ...schedule.milestones.filter((m) => m.dueDate).map((m) => new Date(m.dueDate!).getTime()),
  ];

  if (dates.length === 0) {
    return (
      <div>
        <h2 className="mb-2 text-sm font-semibold text-gray-700">{schedule.projectName}</h2>
        <p className="text-xs text-gray-400">{t("noScheduledTasks")}</p>
      </div>
    );
  }

  const min = Math.min(...dates);
  const max = Math.max(...dates);
  const span = Math.max(max - min, 24 * 60 * 60 * 1000);
  const pct = (time: number) => ((time - min) / span) * 100;

  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold text-gray-700">{schedule.projectName}</h2>
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white p-4">
        <div className="relative flex flex-col gap-2" style={{ minWidth: 480 }}>
          {schedule.milestones
            .filter((m) => m.dueDate)
            .map((m) => (
              <div
                key={m.id}
                className="absolute top-0 h-full w-3 -translate-x-1/2 rotate-45 bg-brand-500/70"
                style={{ left: `${pct(new Date(m.dueDate!).getTime())}%` }}
                title={m.name}
              />
            ))}
          {dated.map((task) => {
            const left = pct(new Date(task.startDate!).getTime());
            const right = pct(new Date(task.dueDate!).getTime());
            return (
              <div key={task.id} className="flex items-center gap-3">
                <div className="w-36 flex-none truncate text-xs text-gray-600">{task.name}</div>
                <div className="relative h-6 min-w-[300px] flex-1 rounded bg-gray-100">
                  <div
                    className={`absolute h-6 rounded ${STATUS_STYLES[task.status]} ${task.isCritical ? "ring-2 ring-error-600" : ""}`}
                    style={{ left: `${left}%`, width: `${Math.max(right - left, 2)}%` }}
                    title={`${task.name}: ${formatDate(new Date(task.startDate!))} – ${formatDate(new Date(task.dueDate!))}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
