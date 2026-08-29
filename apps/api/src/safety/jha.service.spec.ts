import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { JhaService } from "./jha.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "Foreman" };

describe("JhaService", () => {
  let service: JhaService;
  let prisma: {
    project: { findFirst: jest.Mock };
    task: { findFirst: jest.Mock };
    worker: { count: jest.Mock };
    jobHazardAnalysis: { findMany: jest.Mock; create: jest.Mock; findFirst: jest.Mock; findUniqueOrThrow: jest.Mock };
    jhaAcknowledgment: { createMany: jest.Mock };
  };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn() },
      task: { findFirst: jest.fn() },
      worker: { count: jest.fn() },
      jobHazardAnalysis: { findMany: jest.fn(), create: jest.fn(), findFirst: jest.fn(), findUniqueOrThrow: jest.fn() },
      jhaAcknowledgment: { createMany: jest.fn() },
    };
    audit = { record: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [JhaService, { provide: PrismaService, useValue: prisma }, { provide: AuditService, useValue: audit }],
    }).compile();

    service = module.get(JhaService);
  });

  describe("listForProject()", () => {
    it("rejects a project that doesn't belong to this company", async () => {
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(service.listForProject(COMPANY_A, "project-1")).rejects.toThrow(NotFoundException);
    });
  });

  describe("create()", () => {
    it("rejects a project that doesn't belong to this company", async () => {
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(
        service.create(COMPANY_A, ACTOR, {
          projectId: "project-1",
          date: new Date().toISOString(),
          taskDescription: "Excavation",
          hazards: "Cave-in risk",
          controlMeasures: "Trench box",
          acknowledgedWorkerIds: [],
        }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.jobHazardAnalysis.create).not.toHaveBeenCalled();
    });

    it("rejects a taskId that doesn't belong to the given project", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", companyId: COMPANY_A, name: "Site A" });
      prisma.task.findFirst.mockResolvedValue(null);

      await expect(
        service.create(COMPANY_A, ACTOR, {
          projectId: "project-1",
          taskId: "task-1",
          date: new Date().toISOString(),
          taskDescription: "Excavation",
          hazards: "Cave-in risk",
          controlMeasures: "Trench box",
          acknowledgedWorkerIds: [],
        }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.jobHazardAnalysis.create).not.toHaveBeenCalled();
    });

    it("rejects an acknowledgedWorkerIds entry that doesn't belong to this company", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", companyId: COMPANY_A, name: "Site A" });
      prisma.worker.count.mockResolvedValue(1);

      await expect(
        service.create(COMPANY_A, ACTOR, {
          projectId: "project-1",
          date: new Date().toISOString(),
          taskDescription: "Excavation",
          hazards: "Cave-in risk",
          controlMeasures: "Trench box",
          acknowledgedWorkerIds: ["worker-1", "worker-2"],
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.jobHazardAnalysis.create).not.toHaveBeenCalled();
    });

    it("creates a JHA with acknowledgments and records an audit entry", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", companyId: COMPANY_A, name: "Site A" });
      prisma.worker.count.mockResolvedValue(2);
      prisma.jobHazardAnalysis.create.mockResolvedValue({ id: "jha-1", acknowledgments: [] });

      await service.create(COMPANY_A, ACTOR, {
        projectId: "project-1",
        date: new Date().toISOString(),
        taskDescription: "Excavation",
        hazards: "Cave-in risk",
        controlMeasures: "Trench box",
        requiredPpe: "Hard hat, steel toes",
        acknowledgedWorkerIds: ["worker-1", "worker-2"],
      });

      expect(prisma.jobHazardAnalysis.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: COMPANY_A,
            projectId: "project-1",
            taskDescription: "Excavation",
            hazards: "Cave-in risk",
            controlMeasures: "Trench box",
            requiredPpe: "Hard hat, steel toes",
            conductedByUserId: ACTOR.userId,
            conductedByName: ACTOR.name,
            acknowledgments: { create: [{ workerId: "worker-1" }, { workerId: "worker-2" }] },
          }),
        }),
      );
      expect(audit.record).toHaveBeenCalled();
    });
  });

  describe("acknowledge()", () => {
    it("rejects a JHA that doesn't belong to this company", async () => {
      prisma.jobHazardAnalysis.findFirst.mockResolvedValue(null);

      await expect(service.acknowledge(COMPANY_A, "jha-1", { workerIds: ["worker-1"] })).rejects.toThrow(NotFoundException);
      expect(prisma.jhaAcknowledgment.createMany).not.toHaveBeenCalled();
    });

    it("skips duplicates so re-acknowledging an already-signed worker doesn't error", async () => {
      prisma.jobHazardAnalysis.findFirst.mockResolvedValue({ id: "jha-1", companyId: COMPANY_A });
      prisma.worker.count.mockResolvedValue(1);
      prisma.jobHazardAnalysis.findUniqueOrThrow.mockResolvedValue({ id: "jha-1", acknowledgments: [] });

      await service.acknowledge(COMPANY_A, "jha-1", { workerIds: ["worker-1"] });

      expect(prisma.jhaAcknowledgment.createMany).toHaveBeenCalledWith({
        data: [{ jhaId: "jha-1", workerId: "worker-1" }],
        skipDuplicates: true,
      });
    });
  });
});
