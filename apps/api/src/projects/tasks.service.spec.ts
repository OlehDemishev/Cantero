import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { TasksService } from "./tasks.service";
import { PrismaService } from "../common/prisma/prisma.service";

const COMPANY_A = "company-a";

describe("TasksService — dependencies", () => {
  let service: TasksService;
  let prisma: {
    task: { findFirst: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    taskDependency: { findUnique: jest.Mock; findMany: jest.Mock; create: jest.Mock; delete: jest.Mock; findFirst: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      task: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      taskDependency: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), delete: jest.fn(), findFirst: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [TasksService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(TasksService);
  });

  describe("addDependency()", () => {
    it("rejects when the successor task does not belong to this company", async () => {
      prisma.task.findFirst.mockResolvedValue(null);

      await expect(service.addDependency(COMPANY_A, "task-2", { predecessorId: "task-1" })).rejects.toThrow(NotFoundException);
      expect(prisma.taskDependency.create).not.toHaveBeenCalled();
    });

    it("rejects a task depending on itself", async () => {
      prisma.task.findFirst.mockResolvedValue({ id: "task-1", projectId: "project-1" });

      await expect(service.addDependency(COMPANY_A, "task-1", { predecessorId: "task-1" })).rejects.toThrow(BadRequestException);
      expect(prisma.taskDependency.create).not.toHaveBeenCalled();
    });

    it("rejects a predecessor from a different project", async () => {
      prisma.task.findFirst
        .mockResolvedValueOnce({ id: "task-2", projectId: "project-1" }) // successor lookup
        .mockResolvedValueOnce(null); // predecessor lookup scoped to same project

      await expect(service.addDependency(COMPANY_A, "task-2", { predecessorId: "task-1" })).rejects.toThrow(BadRequestException);
      expect(prisma.taskDependency.create).not.toHaveBeenCalled();
    });

    it("rejects a dependency that would create a cycle", async () => {
      prisma.task.findFirst
        .mockResolvedValueOnce({ id: "task-3", projectId: "project-1" }) // successor
        .mockResolvedValueOnce({ id: "task-1", projectId: "project-1" }); // predecessor

      // task-3 (successor) already has an edge to task-1 (predecessor), so task-1 -> task-3 would close a loop.
      prisma.taskDependency.findMany.mockImplementation(({ where }: { where: { predecessorId: string } }) => {
        if (where.predecessorId === "task-3") return Promise.resolve([{ successorId: "task-1" }]);
        return Promise.resolve([]);
      });

      await expect(service.addDependency(COMPANY_A, "task-3", { predecessorId: "task-1" })).rejects.toThrow(BadRequestException);
      expect(prisma.taskDependency.create).not.toHaveBeenCalled();
    });

    it("rejects a duplicate dependency", async () => {
      prisma.task.findFirst
        .mockResolvedValueOnce({ id: "task-2", projectId: "project-1" })
        .mockResolvedValueOnce({ id: "task-1", projectId: "project-1" });
      prisma.taskDependency.findMany.mockResolvedValue([]);
      prisma.taskDependency.findUnique.mockResolvedValue({ id: "existing-dep" });

      await expect(service.addDependency(COMPANY_A, "task-2", { predecessorId: "task-1" })).rejects.toThrow(BadRequestException);
      expect(prisma.taskDependency.create).not.toHaveBeenCalled();
    });

    it("creates the dependency and cascades from the predecessor", async () => {
      prisma.task.findFirst
        .mockResolvedValueOnce({ id: "task-2", projectId: "project-1" })
        .mockResolvedValueOnce({ id: "task-1", projectId: "project-1" });
      prisma.taskDependency.findMany.mockResolvedValue([]);
      prisma.taskDependency.findUnique.mockResolvedValue(null);
      prisma.taskDependency.create.mockResolvedValue({ id: "new-dep", predecessorId: "task-1", successorId: "task-2" });
      prisma.task.findUnique.mockResolvedValue(null); // cascadeShift bails out immediately (no dates)

      const result = await service.addDependency(COMPANY_A, "task-2", { predecessorId: "task-1" });

      expect(result).toEqual({ id: "new-dep", predecessorId: "task-1", successorId: "task-2" });
      expect(prisma.taskDependency.create).toHaveBeenCalledWith({
        data: { predecessorId: "task-1", successorId: "task-2", type: undefined, lagDays: undefined },
      });
    });
  });

  describe("removeDependency()", () => {
    it("rejects when the dependency does not belong to this company", async () => {
      prisma.taskDependency.findFirst.mockResolvedValue(null);

      await expect(service.removeDependency(COMPANY_A, "dep-1")).rejects.toThrow(NotFoundException);
      expect(prisma.taskDependency.delete).not.toHaveBeenCalled();
    });
  });
});

describe("TasksService.getLookAhead", () => {
  let service: TasksService;
  let prisma: {
    project: { findFirst: jest.Mock };
    task: { findMany: jest.Mock };
  };

  function daysFromNowUTC(days: number): Date {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
  }

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn().mockResolvedValue({ id: "project-1", companyId: COMPANY_A }) },
      task: { findMany: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [TasksService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(TasksService);
  });

  it("marks a task ready when it has no finish_to_start predecessors", async () => {
    prisma.task.findMany.mockResolvedValue([
      { id: "task-1", name: "Framing", status: "planned", startDate: daysFromNowUTC(2), dueDate: daysFromNowUTC(5), isOutdoorWork: false, predecessorLinks: [] },
    ]);

    const result = await service.getLookAhead(COMPANY_A, "project-1");

    expect(result[0].ready).toBe(true);
    expect(result[0].blockedByTaskNames).toEqual([]);
  });

  it("marks a task not ready when a finish_to_start predecessor isn't done yet", async () => {
    prisma.task.findMany.mockResolvedValue([
      {
        id: "task-2",
        name: "Drywall",
        status: "planned",
        startDate: daysFromNowUTC(3),
        dueDate: daysFromNowUTC(6),
        isOutdoorWork: false,
        predecessorLinks: [
          { type: "finish_to_start", predecessor: { id: "task-1", name: "Framing", status: "in_progress" } },
        ],
      },
    ]);

    const result = await service.getLookAhead(COMPANY_A, "project-1");

    expect(result[0].ready).toBe(false);
    expect(result[0].blockedByTaskNames).toEqual(["Framing"]);
  });

  it("ignores a non-finish_to_start predecessor when computing readiness", async () => {
    prisma.task.findMany.mockResolvedValue([
      {
        id: "task-2",
        name: "Inspection",
        status: "planned",
        startDate: daysFromNowUTC(3),
        dueDate: daysFromNowUTC(6),
        isOutdoorWork: false,
        predecessorLinks: [
          { type: "start_to_start", predecessor: { id: "task-1", name: "Framing", status: "in_progress" } },
        ],
      },
    ]);

    const result = await service.getLookAhead(COMPANY_A, "project-1");

    expect(result[0].ready).toBe(true);
  });

  it("collapses an overdue-but-not-done task into week 0 instead of a negative index", async () => {
    prisma.task.findMany.mockResolvedValue([
      { id: "task-1", name: "Overdue task", status: "planned", startDate: daysFromNowUTC(-10), dueDate: daysFromNowUTC(-5), isOutdoorWork: false, predecessorLinks: [] },
    ]);

    const result = await service.getLookAhead(COMPANY_A, "project-1");

    expect(result[0].weekIndex).toBe(0);
  });

  it("buckets a task starting in week 2 correctly and clamps beyond the window", async () => {
    prisma.task.findMany.mockResolvedValue([
      { id: "task-1", name: "Week 2 task", status: "planned", startDate: daysFromNowUTC(15), dueDate: daysFromNowUTC(18), isOutdoorWork: false, predecessorLinks: [] },
    ]);

    const result = await service.getLookAhead(COMPANY_A, "project-1");

    expect(result[0].weekIndex).toBe(2);
  });

  it("excludes an already-done task", async () => {
    prisma.task.findMany.mockResolvedValue([]);

    await service.getLookAhead(COMPANY_A, "project-1");

    const call = prisma.task.findMany.mock.calls[0][0];
    expect(call.where.status).toEqual({ not: "done" });
  });
});

describe("TasksService.portfolioSchedule", () => {
  let service: TasksService;
  let prisma: {
    project: { findMany: jest.Mock };
    task: { findMany: jest.Mock };
    milestone: { findMany: jest.Mock };
    taskDependency: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      project: { findMany: jest.fn() },
      task: { findMany: jest.fn().mockResolvedValue([]) },
      milestone: { findMany: jest.fn().mockResolvedValue([]) },
      taskDependency: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const module = await Test.createTestingModule({
      providers: [TasksService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(TasksService);
  });

  it("computes an independent critical path per project rather than one merged graph", async () => {
    prisma.project.findMany.mockResolvedValue([
      { id: "project-1", name: "Site A" },
      { id: "project-2", name: "Site B" },
    ]);
    prisma.task.findMany.mockImplementation(({ where }: { where: { projectId: string } }) => {
      if (where.projectId === "project-1") {
        return Promise.resolve([
          { id: "task-1", name: "Foundation", status: "planned", startDate: new Date("2026-09-01"), dueDate: new Date("2026-09-05") },
        ]);
      }
      return Promise.resolve([
        { id: "task-2", name: "Framing", status: "planned", startDate: new Date("2026-10-01"), dueDate: new Date("2026-10-10") },
      ]);
    });

    const result = await service.portfolioSchedule(COMPANY_A, ["project-1", "project-2"]);

    expect(result).toHaveLength(2);
    expect(result[0].projectName).toBe("Site A");
    expect(result[0].tasks[0].isCritical).toBe(true); // sole task on its own project's chain is always critical
    expect(result[1].projectName).toBe("Site B");
    expect(result[1].tasks[0].id).toBe("task-2");
  });

  it("only returns projects that belong to this company", async () => {
    prisma.project.findMany.mockResolvedValue([{ id: "project-1", name: "Site A" }]);

    const result = await service.portfolioSchedule(COMPANY_A, ["project-1", "foreign-project"]);

    expect(result).toHaveLength(1);
    const call = prisma.project.findMany.mock.calls[0][0];
    expect(call.where.companyId).toBe(COMPANY_A);
  });

  it("includes milestones alongside tasks", async () => {
    prisma.project.findMany.mockResolvedValue([{ id: "project-1", name: "Site A" }]);
    prisma.milestone.findMany.mockResolvedValue([{ id: "m-1", name: "Permit approval", dueDate: new Date("2026-09-01") }]);

    const result = await service.portfolioSchedule(COMPANY_A, ["project-1"]);

    expect(result[0].milestones).toEqual([{ id: "m-1", name: "Permit approval", dueDate: new Date("2026-09-01") }]);
  });
});
