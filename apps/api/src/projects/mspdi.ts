import { XMLParser } from "fast-xml-parser";
import type { TaskDependencyType } from "@prisma/client";
import {
  HOURS_PER_WORKDAY,
  dateOnly,
  isoDate,
  percentFromStatus,
  statusFromPercent,
  workingDaysInclusive,
  type ExchangeDependency,
  type ExchangeSchedule,
  type ExchangeTask,
} from "./schedule-exchange";

/** MSPDI is what desktop Microsoft Project reads and writes via File > Save As > XML. Link types
 * are numeric: 0 FF, 1 FS, 2 SF, 3 SS. LinkLag is in tenths of a minute (4800 = one 8h day). */
const TYPE_FROM_MSPDI: Record<string, TaskDependencyType> = {
  "0": "finish_to_finish",
  "1": "finish_to_start",
  "2": "start_to_finish",
  "3": "start_to_start",
};
const TYPE_TO_MSPDI: Record<TaskDependencyType, number> = {
  finish_to_finish: 0,
  finish_to_start: 1,
  start_to_finish: 2,
  start_to_start: 3,
};
const TENTH_MINUTES_PER_DAY = HOURS_PER_WORKDAY * 60 * 10;

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: true,
  isArray: (name) => name === "Task" || name === "PredecessorLink",
});

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function parseMspdi(xml: string): ExchangeSchedule {
  let doc: { Project?: { Name?: string; Title?: string; Tasks?: { Task?: Record<string, unknown>[] } } };
  try {
    doc = parser.parse(xml);
  } catch {
    throw new Error("Not a valid XML file");
  }
  const project = doc.Project;
  if (!project) throw new Error("Not an MS Project XML (MSPDI) file — no <Project> root element");

  const tasks: ExchangeTask[] = [];
  const dependencies: ExchangeDependency[] = [];
  const included = new Set<string>();
  const rawLinks: { successorUid: string; predecessorUid: string; type: TaskDependencyType; lagDays: number }[] = [];

  for (const raw of project.Tasks?.Task ?? []) {
    const uid = String(raw.UID ?? "");
    if (!uid || uid === "0") continue; // UID 0 is the project summary row
    if (String(raw.IsNull ?? "0") === "1") continue;
    if (String(raw.Summary ?? "0") === "1") continue;

    const isMilestone = String(raw.Milestone ?? "0") === "1";
    tasks.push({
      uid,
      name: String(raw.Name ?? `Task ${uid}`),
      startDate: dateOnly(raw.Start as string | undefined),
      finishDate: dateOnly(raw.Finish as string | undefined),
      status: statusFromPercent(Number(raw.PercentComplete ?? 0)),
      isMilestone,
    });
    included.add(uid);

    const links = (raw.PredecessorLink as Record<string, unknown>[] | undefined) ?? [];
    for (const link of links) {
      if (String(link.CrossProject ?? "0") === "1") continue;
      rawLinks.push({
        successorUid: uid,
        predecessorUid: String(link.PredecessorUID),
        type: TYPE_FROM_MSPDI[String(link.Type ?? "1")] ?? "finish_to_start",
        lagDays: Math.round(Number(link.LinkLag ?? 0) / TENTH_MINUTES_PER_DAY),
      });
    }
  }

  // A link pointing at a dropped summary row (or a missing task) has nothing to connect to.
  for (const link of rawLinks) {
    if (included.has(link.predecessorUid) && included.has(link.successorUid)) {
      dependencies.push({ predecessorUid: link.predecessorUid, successorUid: link.successorUid, type: link.type, lagDays: link.lagDays });
    }
  }

  return { name: project.Title || project.Name || "Imported project", tasks, dependencies };
}

export function buildMspdi(schedule: ExchangeSchedule): string {
  const dated = schedule.tasks.filter((t) => t.startDate || t.finishDate);
  const starts = dated.map((t) => (t.startDate ?? t.finishDate)!.getTime());
  const finishes = dated.map((t) => (t.finishDate ?? t.startDate)!.getTime());
  const projectStart = starts.length ? new Date(Math.min(...starts)) : new Date();
  const projectFinish = finishes.length ? new Date(Math.max(...finishes)) : projectStart;

  const ids = new Map(schedule.tasks.map((t, i) => [t.uid, i + 1]));
  const linksBySuccessor = new Map<string, ExchangeDependency[]>();
  for (const dep of schedule.dependencies) {
    if (!ids.has(dep.predecessorUid) || !ids.has(dep.successorUid)) continue;
    linksBySuccessor.set(dep.successorUid, [...(linksBySuccessor.get(dep.successorUid) ?? []), dep]);
  }

  const taskBlocks = schedule.tasks.map((task) => {
    const uid = ids.get(task.uid)!;
    const start = task.startDate ?? task.finishDate ?? projectStart;
    const finish = task.finishDate ?? task.startDate ?? projectStart;
    const durationHours = task.isMilestone ? 0 : workingDaysInclusive(start, finish) * HOURS_PER_WORKDAY;
    const links = (linksBySuccessor.get(task.uid) ?? [])
      .map(
        (dep) => `      <PredecessorLink>
        <PredecessorUID>${ids.get(dep.predecessorUid)}</PredecessorUID>
        <Type>${TYPE_TO_MSPDI[dep.type]}</Type>
        <CrossProject>0</CrossProject>
        <LinkLag>${dep.lagDays * TENTH_MINUTES_PER_DAY}</LinkLag>
        <LagFormat>7</LagFormat>
      </PredecessorLink>`,
      )
      .join("\n");
    return `    <Task>
      <UID>${uid}</UID>
      <ID>${uid}</ID>
      <Name>${escapeXml(task.name)}</Name>
      <Type>0</Type>
      <OutlineLevel>1</OutlineLevel>
      <Start>${isoDate(start)}T08:00:00</Start>
      <Finish>${isoDate(finish)}T17:00:00</Finish>
      <Duration>PT${durationHours}H0M0S</Duration>
      <Milestone>${task.isMilestone ? 1 : 0}</Milestone>
      <Summary>0</Summary>
      <PercentComplete>${percentFromStatus(task.status)}</PercentComplete>
${links}
    </Task>`;
  });

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Project xmlns="http://schemas.microsoft.com/project">
  <SaveVersion>14</SaveVersion>
  <Name>${escapeXml(schedule.name)}</Name>
  <Title>${escapeXml(schedule.name)}</Title>
  <ScheduleFromStart>1</ScheduleFromStart>
  <StartDate>${isoDate(projectStart)}T08:00:00</StartDate>
  <FinishDate>${isoDate(projectFinish)}T17:00:00</FinishDate>
  <MinutesPerDay>${HOURS_PER_WORKDAY * 60}</MinutesPerDay>
  <MinutesPerWeek>${HOURS_PER_WORKDAY * 60 * 5}</MinutesPerWeek>
  <Tasks>
${taskBlocks.join("\n")}
  </Tasks>
</Project>
`;
}
