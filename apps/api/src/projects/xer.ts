import type { TaskDependencyType, TaskStatus } from "@prisma/client";
import { HOURS_PER_WORKDAY, dateOnly, isoDate, workingDaysInclusive, type ExchangeDependency, type ExchangeSchedule, type ExchangeTask } from "./schedule-exchange";

/** Primavera P6's XER export: a tab-delimited text file of `%T table` / `%F field names` /
 * `%R row` blocks. Only the tables a schedule round-trip needs are read (PROJECT, TASK, TASKPRED);
 * everything else (calendars, resources, WBS, UDFs...) is ignored, not an error. */
type Row = Record<string, string>;

const TYPE_FROM_XER: Record<string, TaskDependencyType> = {
  PR_FS: "finish_to_start",
  PR_SS: "start_to_start",
  PR_FF: "finish_to_finish",
  PR_SF: "start_to_finish",
};
const TYPE_TO_XER: Record<TaskDependencyType, string> = {
  finish_to_start: "PR_FS",
  start_to_start: "PR_SS",
  finish_to_finish: "PR_FF",
  start_to_finish: "PR_SF",
};
const STATUS_FROM_XER: Record<string, TaskStatus> = { TK_Complete: "done", TK_Active: "in_progress", TK_NotStart: "planned" };
const STATUS_TO_XER: Record<TaskStatus, string> = { done: "TK_Complete", in_progress: "TK_Active", planned: "TK_NotStart" };

/** XER files are usually Windows-1252, not UTF-8; try strict UTF-8 first and fall back so an
 * umlaut in a task name doesn't turn into replacement characters. */
export function decodeXer(buffer: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return buffer.toString("latin1");
  }
}

function readTables(text: string): Map<string, Row[]> {
  const tables = new Map<string, Row[]>();
  let current: string | null = null;
  let fields: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const cells = line.split("\t");
    switch (cells[0]) {
      case "%T":
        current = cells[1];
        fields = [];
        tables.set(current, tables.get(current) ?? []);
        break;
      case "%F":
        fields = cells.slice(1);
        break;
      case "%R":
        if (current) {
          const row: Row = {};
          fields.forEach((field, i) => (row[field] = cells[i + 1] ?? ""));
          tables.get(current)!.push(row);
        }
        break;
    }
  }
  return tables;
}

export function parseXer(text: string): ExchangeSchedule {
  if (!text.startsWith("ERMHDR")) throw new Error("Not a Primavera P6 XER file — missing ERMHDR header");
  const tables = readTables(text);

  const projects = tables.get("PROJECT") ?? [];
  const project = projects[0];
  // A multi-project XER holds several schedules; only the first is imported so tasks from
  // unrelated projects don't get merged into one.
  const projectId = project?.proj_id;
  const taskRows = (tables.get("TASK") ?? []).filter((row) => !projectId || row.proj_id === projectId);

  const tasks: ExchangeTask[] = [];
  const included = new Set<string>();
  for (const row of taskRows) {
    if (row.task_type === "TT_WBS") continue;
    const uid = row.task_id;
    if (!uid) continue;
    const isMilestone = row.task_type === "TT_Mile" || row.task_type === "TT_FinMile";
    tasks.push({
      uid,
      name: row.task_name || row.task_code || `Task ${uid}`,
      startDate: dateOnly(row.act_start_date || row.target_start_date || row.early_start_date),
      finishDate: dateOnly(row.act_end_date || row.target_end_date || row.early_end_date),
      status: STATUS_FROM_XER[row.status_code] ?? "planned",
      isMilestone,
    });
    included.add(uid);
  }

  const dependencies: ExchangeDependency[] = [];
  for (const row of tables.get("TASKPRED") ?? []) {
    if (!included.has(row.task_id) || !included.has(row.pred_task_id)) continue;
    dependencies.push({
      predecessorUid: row.pred_task_id,
      successorUid: row.task_id,
      type: TYPE_FROM_XER[row.pred_type] ?? "finish_to_start",
      lagDays: Math.round(Number(row.lag_hr_cnt || 0) / HOURS_PER_WORKDAY),
    });
  }

  return { name: project?.proj_short_name || "Imported project", tasks, dependencies };
}

function xerDate(date: Date, endOfDay: boolean): string {
  return `${isoDate(date)} ${endOfDay ? "17:00" : "08:00"}`;
}

function table(name: string, fields: string[], rows: string[][]): string {
  return [`%T\t${name}`, `%F\t${fields.join("\t")}`, ...rows.map((r) => `%R\t${r.join("\t")}`)].join("\n");
}

/** Minimal but structurally complete XER — header plus the CALENDAR, PROJECT, PROJWBS, TASK and
 * TASKPRED tables P6 expects. Not verified against a real P6 install (no license available), so
 * treat a P6 import of this file as something to test once with your own copy before relying on. */
export function buildXer(schedule: ExchangeSchedule): string {
  const today = isoDate(new Date());
  const projId = "1";
  const wbsId = "1";
  const calId = "1";
  const ids = new Map(schedule.tasks.map((t, i) => [t.uid, String(i + 1)]));

  const dated = schedule.tasks.filter((t) => t.startDate || t.finishDate);
  const starts = dated.map((t) => (t.startDate ?? t.finishDate)!.getTime());
  const projectStart = starts.length ? new Date(Math.min(...starts)) : new Date();

  const taskRows = schedule.tasks.map((task) => {
    const start = task.startDate ?? task.finishDate ?? projectStart;
    const finish = task.finishDate ?? task.startDate ?? projectStart;
    const hours = task.isMilestone ? 0 : workingDaysInclusive(start, finish) * HOURS_PER_WORKDAY;
    return [
      ids.get(task.uid)!,
      projId,
      wbsId,
      calId,
      task.status === "done" ? "100" : task.status === "in_progress" ? "50" : "0",
      task.isMilestone ? "TT_Mile" : "TT_Task",
      STATUS_TO_XER[task.status],
      ids.get(task.uid)!,
      task.name.replace(/[\t\r\n]+/g, " "),
      String(hours),
      xerDate(start, false),
      xerDate(finish, true),
    ];
  });

  const predRows = schedule.dependencies
    .filter((d) => ids.has(d.predecessorUid) && ids.has(d.successorUid))
    .map((dep, i) => [String(i + 1), ids.get(dep.successorUid)!, ids.get(dep.predecessorUid)!, projId, projId, TYPE_TO_XER[dep.type], String(dep.lagDays * HOURS_PER_WORKDAY)]);

  return (
    [
      `ERMHDR\t8.4\t${today}\tProject\tcantero\tCantero\tProject Management\tUSD`,
      table("CALENDAR", ["clndr_id", "clndr_name", "day_hr_cnt", "week_hr_cnt", "default_flag"], [[calId, "Standard 5 Day Workweek", String(HOURS_PER_WORKDAY), String(HOURS_PER_WORKDAY * 5), "Y"]]),
      table(
        "PROJECT",
        ["proj_id", "proj_short_name", "clndr_id", "plan_start_date", "last_recalc_date"],
        [[projId, schedule.name.replace(/[\t\r\n]+/g, " ").slice(0, 40), calId, xerDate(projectStart, false), `${today} 00:00`]],
      ),
      table("PROJWBS", ["wbs_id", "proj_id", "proj_node_flag", "wbs_short_name", "wbs_name"], [[wbsId, projId, "Y", "1", schedule.name.replace(/[\t\r\n]+/g, " ")]]),
      table(
        "TASK",
        ["task_id", "proj_id", "wbs_id", "clndr_id", "phys_complete_pct", "task_type", "status_code", "task_code", "task_name", "target_drtn_hr_cnt", "target_start_date", "target_end_date"],
        taskRows,
      ),
      table("TASKPRED", ["task_pred_id", "task_id", "pred_task_id", "proj_id", "pred_proj_id", "pred_type", "lag_hr_cnt"], predRows),
      "%E",
    ].join("\n") + "\n"
  );
}
