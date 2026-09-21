import { buildMspdi, parseMspdi } from "./mspdi";
import { buildXer, decodeXer, parseXer } from "./xer";
import type { ExchangeSchedule } from "./schedule-exchange";

const schedule: ExchangeSchedule = {
  name: "Rohbau & Ausbau <Haus 1>",
  tasks: [
    { uid: "a", name: "Fundament", startDate: new Date("2026-10-05"), finishDate: new Date("2026-10-16"), status: "done", isMilestone: false },
    { uid: "b", name: "Mauerwerk", startDate: new Date("2026-10-19"), finishDate: new Date("2026-11-13"), status: "in_progress", isMilestone: false },
    { uid: "c", name: "Rohbauabnahme", startDate: new Date("2026-11-13"), finishDate: new Date("2026-11-13"), status: "planned", isMilestone: true },
    { uid: "d", name: "Dach", startDate: new Date("2026-11-16"), finishDate: new Date("2026-11-27"), status: "planned", isMilestone: false },
  ],
  dependencies: [
    { predecessorUid: "a", successorUid: "b", type: "finish_to_start", lagDays: 0 },
    { predecessorUid: "b", successorUid: "d", type: "start_to_start", lagDays: 3 },
    { predecessorUid: "b", successorUid: "c", type: "finish_to_finish", lagDays: 0 },
  ],
};

function normalize(s: ExchangeSchedule) {
  const nameOf = new Map(s.tasks.map((t) => [t.uid, t.name]));
  return {
    name: s.name,
    tasks: s.tasks.map((t) => ({ name: t.name, start: t.startDate?.toISOString(), finish: t.finishDate?.toISOString(), status: t.status, ms: t.isMilestone })),
    deps: s.dependencies.map((d) => `${nameOf.get(d.predecessorUid)}>${nameOf.get(d.successorUid)}:${d.type}:${d.lagDays}`).sort(),
  };
}

describe("MSPDI", () => {
  it("round-trips a schedule through build then parse, including escaping in names", () => {
    const parsed = parseMspdi(buildMspdi(schedule));
    expect(normalize(parsed)).toEqual(normalize(schedule));
  });

  it("emits the numeric link types and lag in tenths of a minute MS Project expects", () => {
    const xml = buildMspdi(schedule);
    expect(xml).toContain("<Type>3</Type>"); // SS
    expect(xml).toContain("<LinkLag>14400</LinkLag>"); // 3 days * 4800
    expect(xml).toContain("<Milestone>1</Milestone>");
  });

  it("skips the project summary row, summary tasks, null rows, and links that point at them", () => {
    const xml = `<?xml version="1.0"?>
<Project xmlns="http://schemas.microsoft.com/project"><Name>P</Name><Tasks>
  <Task><UID>0</UID><Name>P</Name><Summary>1</Summary></Task>
  <Task><UID>1</UID><Name>Phase</Name><Summary>1</Summary></Task>
  <Task><UID>2</UID><Name>Real</Name><Start>2026-10-05T08:00:00</Start><Finish>2026-10-06T17:00:00</Finish><PercentComplete>100</PercentComplete>
    <PredecessorLink><PredecessorUID>1</PredecessorUID><Type>1</Type></PredecessorLink></Task>
  <Task><UID>3</UID><IsNull>1</IsNull></Task>
</Tasks></Project>`;
    const parsed = parseMspdi(xml);
    expect(parsed.tasks.map((t) => t.name)).toEqual(["Real"]);
    expect(parsed.tasks[0].status).toBe("done");
    expect(parsed.dependencies).toEqual([]);
  });

  it("ignores cross-project links", () => {
    const xml = `<Project><Tasks>
  <Task><UID>1</UID><Name>A</Name></Task>
  <Task><UID>2</UID><Name>B</Name><PredecessorLink><PredecessorUID>1</PredecessorUID><CrossProject>1</CrossProject></PredecessorLink></Task>
</Tasks></Project>`;
    expect(parseMspdi(xml).dependencies).toEqual([]);
  });

  it("rejects XML that isn't an MSPDI project", () => {
    expect(() => parseMspdi("<Other/>")).toThrow(/MSPDI/);
  });
});

describe("XER", () => {
  it("round-trips a schedule through build then parse", () => {
    const parsed = parseXer(buildXer(schedule));
    expect(normalize(parsed)).toEqual({ ...normalize(schedule), name: "Rohbau & Ausbau <Haus 1>" });
  });

  it("parses a hand-written P6 export: skips WBS rows, prefers actual dates, maps types and lag hours", () => {
    const xer = [
      "ERMHDR\t8.4\t2026-09-21\tProject\tadmin\tdb\tProject Management\tUSD",
      "%T\tPROJECT",
      "%F\tproj_id\tproj_short_name",
      "%R\t100\tBrücke Nord",
      "%T\tTASK",
      "%F\ttask_id\tproj_id\ttask_type\tstatus_code\ttask_name\ttarget_start_date\ttarget_end_date\tact_start_date\tact_end_date",
      "%R\t1\t100\tTT_WBS\tTK_NotStart\tRoot\t\t\t\t",
      "%R\t2\t100\tTT_Task\tTK_Complete\tPfeiler\t2026-10-01 08:00\t2026-10-10 17:00\t2026-10-02 08:00\t2026-10-12 17:00",
      "%R\t3\t100\tTT_Task\tTK_NotStart\tÜberbau\t2026-10-13 08:00\t2026-10-30 17:00\t\t",
      "%R\t4\t999\tTT_Task\tTK_NotStart\tOther project\t2026-10-13 08:00\t2026-10-30 17:00\t\t",
      "%T\tTASKPRED",
      "%F\ttask_pred_id\ttask_id\tpred_task_id\tpred_type\tlag_hr_cnt",
      "%R\t1\t3\t2\tPR_SS\t16",
      "%R\t2\t3\t1\tPR_FS\t0",
      "%E",
    ].join("\r\n");
    const parsed = parseXer(xer);
    expect(parsed.name).toBe("Brücke Nord");
    expect(parsed.tasks.map((t) => t.name)).toEqual(["Pfeiler", "Überbau"]);
    expect(parsed.tasks[0].startDate?.toISOString()).toBe("2026-10-02T00:00:00.000Z"); // actual, not target
    expect(parsed.tasks[0].status).toBe("done");
    expect(parsed.dependencies).toEqual([{ predecessorUid: "2", successorUid: "3", type: "start_to_start", lagDays: 2 }]);
  });

  it("rejects a file without the ERMHDR header", () => {
    expect(() => parseXer("hello")).toThrow(/XER/);
  });

  it("falls back to Windows-1252 when the bytes aren't valid UTF-8", () => {
    expect(decodeXer(Buffer.from([0x4d, 0xfc, 0x6c, 0x6c]))).toBe("Müll"); // ü as a single 0xFC byte
    expect(decodeXer(Buffer.from("Müll", "utf-8"))).toBe("Müll");
  });
});
