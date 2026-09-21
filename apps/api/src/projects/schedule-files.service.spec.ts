import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ScheduleFilesService } from "./schedule-files.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { ProjectAccessService } from "../common/project-access/project-access.service";
import { AuditService } from "../common/audit/audit.service";
import { buildMspdi } from "./mspdi";

const COMPANY = "company-a";
const ACTOR = { userId: "u1", name: "Jane" };

function mspdiFile(schedule: Parameters<typeof buildMspdi>[0]) {
  return { originalname: "plan.xml", buffer: Buffer.from(buildMspdi(schedule), "utf-8") };
}
const t = (uid: string, name: string, isMilestone = false) => ({
  uid,
  name,
  startDate: new Date("2026-10-05"),
  finishDate: new Date("2026-10-09"),
  status: "planned" as const,
  isMilestone,
});

describe("ScheduleFilesService", () => {
  let service: ScheduleFilesService;
  let tx: {
    task: { aggregate: jest.Mock; create: jest.Mock };
    milestone: { create: jest.Mock };
    taskDependency: { create: jest.Mock };
  };
  let prisma: { project: { findFirst: jest.Mock }; task: { findMany: jest.Mock }; milestone: { findMany: jest.Mock }; $transaction: jest.Mock };
  let audit: { record: jest.Mock };

  beforeEach(() => {
    let n = 0;
    tx = {
      task: { aggregate: jest.fn().mockResolvedValue({ _max: { sortOrder: 4 } }), create: jest.fn(async () => ({ id: `new-${++n}` })) },
      milestone: { create: jest.fn() },
      taskDependency: { create: jest.fn() },
    };
    prisma = {
      project: { findFirst: jest.fn().mockResolvedValue({ id: "p1", name: "Haus 1" }) },
      task: { findMany: jest.fn().mockResolvedValue([]) },
      milestone: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(tx)),
    };
    audit = { record: jest.fn() };
    service = new ScheduleFilesService(
      prisma as unknown as PrismaService,
      { assertAccess: jest.fn() } as unknown as ProjectAccessService,
      audit as unknown as AuditService,
    );
  });

  it("404s for a project outside the company", async () => {
    prisma.project.findFirst.mockResolvedValue(null);
    await expect(service.importFile(COMPANY, ACTOR, "p1", mspdiFile({ name: "x", tasks: [t("a", "A")], dependencies: [] }))).rejects.toThrow(NotFoundException);
  });

  it("rejects a file that isn't a schedule", async () => {
    await expect(service.importFile(COMPANY, ACTOR, "p1", { originalname: "x.xml", buffer: Buffer.from("<Other/>") })).rejects.toThrow(BadRequestException);
  });

  it("appends tasks after the project's existing sortOrder, keeping the file's dates and statuses", async () => {
    const result = await service.importFile(COMPANY, ACTOR, "p1", mspdiFile({ name: "x", tasks: [t("a", "A"), t("b", "B")], dependencies: [] }));
    expect(result).toMatchObject({ format: "mspdi", tasksCreated: 2, milestonesCreated: 0, dependenciesCreated: 0 });
    expect(tx.task.create.mock.calls[0][0].data).toMatchObject({ name: "A", sortOrder: 5, startDate: new Date("2026-10-05"), dueDate: new Date("2026-10-09") });
    expect(tx.task.create.mock.calls[1][0].data.sortOrder).toBe(6);
    expect(audit.record).toHaveBeenCalledWith(COMPANY, ACTOR, "schedule.imported", "Project", "p1", expect.stringContaining("plan.xml"));
  });

  it("creates milestones as Milestone rows and skips links that touch them", async () => {
    const result = await service.importFile(
      COMPANY,
      ACTOR,
      "p1",
      mspdiFile({
        name: "x",
        tasks: [t("a", "A"), t("m", "Gate", true), t("b", "B")],
        dependencies: [
          { predecessorUid: "a", successorUid: "m", type: "finish_to_start", lagDays: 0 },
          { predecessorUid: "a", successorUid: "b", type: "finish_to_start", lagDays: 2 },
        ],
      }),
    );
    expect(result).toMatchObject({ tasksCreated: 2, milestonesCreated: 1, dependenciesCreated: 1, dependenciesSkipped: 1 });
    expect(tx.milestone.create).toHaveBeenCalledWith({ data: { projectId: "p1", name: "Gate", dueDate: new Date("2026-10-09") } });
    expect(tx.taskDependency.create).toHaveBeenCalledWith({ data: { predecessorId: "new-1", successorId: "new-2", type: "finish_to_start", lagDays: 2 } });
  });

  it("refuses a file whose dependencies form a cycle, before writing anything", async () => {
    const file = mspdiFile({
      name: "x",
      tasks: [t("a", "A"), t("b", "B")],
      dependencies: [
        { predecessorUid: "a", successorUid: "b", type: "finish_to_start", lagDays: 0 },
        { predecessorUid: "b", successorUid: "a", type: "finish_to_start", lagDays: 0 },
      ],
    });
    await expect(service.importFile(COMPANY, ACTOR, "p1", file)).rejects.toThrow(/circular/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("exports tasks, milestones and links as parseable MSPDI/XER", async () => {
    prisma.task.findMany.mockResolvedValue([
      { id: "t1", name: "A", startDate: new Date("2026-10-05"), dueDate: new Date("2026-10-09"), status: "planned", predecessorLinks: [] },
      { id: "t2", name: "B", startDate: new Date("2026-10-12"), dueDate: new Date("2026-10-16"), status: "done", predecessorLinks: [{ predecessorId: "t1", type: "finish_to_start", lagDays: 1 }] },
    ]);
    prisma.milestone.findMany.mockResolvedValue([{ id: "m1", name: "Gate", dueDate: new Date("2026-10-16") }]);

    const xml = await service.exportFile(COMPANY, "p1", "mspdi");
    expect(xml.filename).toBe("Haus_1.xml");
    expect(xml.content).toContain("<PredecessorUID>1</PredecessorUID>");
    expect(xml.content).toContain("<Milestone>1</Milestone>");
    const xer = await service.exportFile(COMPANY, "p1", "xer");
    expect(xer.filename).toBe("Haus_1.xer");
    expect(xer.content.startsWith("ERMHDR")).toBe(true);
    expect(xer.content).toContain("PR_FS\t8");
  });
});
