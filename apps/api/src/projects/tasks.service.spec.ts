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
