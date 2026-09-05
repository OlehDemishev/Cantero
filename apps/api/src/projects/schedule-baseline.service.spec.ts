import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ScheduleBaselineService } from "./schedule-baseline.service";
import { PrismaService } from "../common/prisma/prisma.service";

const COMPANY_A = "company-a";

describe("ScheduleBaselineService", () => {
  let service: ScheduleBaselineService;
  let prisma: {
    project: { findFirst: jest.Mock };
    task: { findMany: jest.Mock };
    scheduleBaseline: { create: jest.Mock; findMany: jest.Mock; findFirst: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn().mockResolvedValue({ id: "p-1", companyId: COMPANY_A }) },
      task: { findMany: jest.fn() },
      scheduleBaseline: { create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [ScheduleBaselineService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(ScheduleBaselineService);
  });

  describe("create()", () => {
    it("snapshots every current task of the project into the baseline", async () => {
      prisma.task.findMany.mockResolvedValue([
        { id: "t-1", name: "Framing", startDate: new Date("2026-01-01"), dueDate: new Date("2026-01-10") },
      ]);
      prisma.scheduleBaseline.create.mockResolvedValue({ id: "b-1" });

      await service.create(COMPANY_A, "Owner", "p-1", { name: "Contract baseline" });

      expect(prisma.scheduleBaseline.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: COMPANY_A,
            projectId: "p-1",
            name: "Contract baseline",
            createdByName: "Owner",
            tasks: {
              create: [{ taskId: "t-1", name: "Framing", startDate: new Date("2026-01-01"), dueDate: new Date("2026-01-10") }],
            },
          }),
        }),
      );
    });

    it("rejects a project that does not belong to this company", async () => {
      prisma.project.findFirst.mockResolvedValue(null);
      await expect(service.create(COMPANY_A, "Owner", "p-x", { name: "X" })).rejects.toThrow(NotFoundException);
      expect(prisma.scheduleBaseline.create).not.toHaveBeenCalled();
    });
  });

  describe("compare()", () => {
    it("runs the baseline's snapshot tasks against the project's current tasks", async () => {
      prisma.scheduleBaseline.findFirst.mockResolvedValue({
        id: "b-1",
        projectId: "p-1",
        name: "Contract baseline",
        createdAt: new Date("2026-01-01"),
        tasks: [{ taskId: "t-1", name: "Framing", startDate: new Date("2026-01-01"), dueDate: new Date("2026-01-10") }],
      });
      prisma.task.findMany.mockResolvedValue([
        { id: "t-1", name: "Framing", status: "in_progress", startDate: new Date("2026-01-01"), dueDate: new Date("2026-01-15") },
      ]);

      const result = await service.compare(COMPANY_A, "b-1");

      expect(result.baselineId).toBe("b-1");
      expect(result.tasks[0]).toEqual(
        expect.objectContaining({ taskId: "t-1", status: "in_progress", slippageDays: 5 }),
      );
    });

    it("throws when the baseline does not belong to this company", async () => {
      prisma.scheduleBaseline.findFirst.mockResolvedValue(null);
      await expect(service.compare(COMPANY_A, "b-x")).rejects.toThrow(NotFoundException);
    });
  });
});
