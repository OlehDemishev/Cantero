import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ResourcePlanningService } from "./resource-planning.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "PM" };

describe("ResourcePlanningService", () => {
  let service: ResourcePlanningService;
  let prisma: {
    worker: { findMany: jest.Mock; findFirst: jest.Mock };
    equipment: { findMany: jest.Mock; findFirst: jest.Mock };
    project: { findFirst: jest.Mock };
    resourceAssignment: { create: jest.Mock; findMany: jest.Mock; findFirst: jest.Mock; delete: jest.Mock };
  };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      worker: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
      equipment: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
      project: { findFirst: jest.fn() },
      resourceAssignment: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn(), delete: jest.fn() },
    };
    audit = { record: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [ResourcePlanningService, { provide: PrismaService, useValue: prisma }, { provide: AuditService, useValue: audit }],
    }).compile();

    service = module.get(ResourcePlanningService);
  });

  describe("create()", () => {
    it("rejects when the project does not belong to this company", async () => {
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(
        service.create(COMPANY_A, ACTOR, {
          projectId: "project-1",
          workerId: "worker-1",
          startDate: "2026-09-01T00:00:00.000Z",
          endDate: "2026-09-05T00:00:00.000Z",
        }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.resourceAssignment.create).not.toHaveBeenCalled();
    });

    it("rejects when the worker does not belong to this company", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", name: "Site A" });
      prisma.worker.findFirst.mockResolvedValue(null);

      await expect(
        service.create(COMPANY_A, ACTOR, {
          projectId: "project-1",
          workerId: "worker-1",
          startDate: "2026-09-01T00:00:00.000Z",
          endDate: "2026-09-05T00:00:00.000Z",
        }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.resourceAssignment.create).not.toHaveBeenCalled();
    });

    it("reports no conflicts when the same worker has no other overlapping assignment", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", name: "Site A" });
      prisma.worker.findFirst.mockResolvedValue({ id: "worker-1" });
      prisma.resourceAssignment.create.mockResolvedValue({
        id: "assign-1",
        workerId: "worker-1",
        equipmentId: null,
        startDate: new Date("2026-09-01T00:00:00.000Z"),
        endDate: new Date("2026-09-05T00:00:00.000Z"),
        note: null,
        project: { id: "project-1", name: "Site A" },
      });
      prisma.resourceAssignment.findMany.mockResolvedValue([]);

      const result = await service.create(COMPANY_A, ACTOR, {
        projectId: "project-1",
        workerId: "worker-1",
        startDate: "2026-09-01T00:00:00.000Z",
        endDate: "2026-09-05T00:00:00.000Z",
      });

      expect(result.conflicts).toEqual([]);
      expect(audit.record).toHaveBeenCalled();
    });

    it("flags a conflict when the same worker already has an overlapping assignment on another project", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-2", name: "Site B" });
      prisma.worker.findFirst.mockResolvedValue({ id: "worker-1" });
      prisma.resourceAssignment.create.mockResolvedValue({
        id: "assign-2",
        workerId: "worker-1",
        equipmentId: null,
        startDate: new Date("2026-09-03T00:00:00.000Z"),
        endDate: new Date("2026-09-08T00:00:00.000Z"),
        note: null,
        project: { id: "project-2", name: "Site B" },
      });
      prisma.resourceAssignment.findMany.mockResolvedValue([
        {
          id: "assign-1",
          startDate: new Date("2026-09-01T00:00:00.000Z"),
          endDate: new Date("2026-09-05T00:00:00.000Z"),
          project: { name: "Site A" },
        },
      ]);

      const result = await service.create(COMPANY_A, ACTOR, {
        projectId: "project-2",
        workerId: "worker-1",
        startDate: "2026-09-03T00:00:00.000Z",
        endDate: "2026-09-08T00:00:00.000Z",
      });

      expect(result.conflicts).toEqual([
        { assignmentId: "assign-1", projectName: "Site A", startDate: "2026-09-01T00:00:00.000Z", endDate: "2026-09-05T00:00:00.000Z" },
      ]);
    });
  });

  describe("delete()", () => {
    it("rejects deleting an assignment that doesn't belong to this company", async () => {
      prisma.resourceAssignment.findFirst.mockResolvedValue(null);

      await expect(service.delete(COMPANY_A, "assign-1")).rejects.toThrow(NotFoundException);
      expect(prisma.resourceAssignment.delete).not.toHaveBeenCalled();
    });
  });

  describe("calendar()", () => {
    it("surfaces an overlapping pair of assignments on the same worker as a conflict", async () => {
      prisma.worker.findMany.mockResolvedValue([
        {
          id: "worker-1",
          name: "Peter Bauer",
          role: "Tiler",
          resourceAssignments: [
            {
              id: "a1",
              startDate: new Date("2026-09-01T00:00:00.000Z"),
              endDate: new Date("2026-09-10T00:00:00.000Z"),
              note: null,
              project: { id: "p1", name: "Site A" },
            },
            {
              id: "a2",
              startDate: new Date("2026-09-05T00:00:00.000Z"),
              endDate: new Date("2026-09-15T00:00:00.000Z"),
              note: null,
              project: { id: "p2", name: "Site B" },
            },
          ],
        },
      ]);

      const result = await service.calendar(COMPANY_A);

      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0]).toMatchObject({
        resourceType: "worker",
        resourceName: "Peter Bauer",
        projectAName: "Site A",
        projectBName: "Site B",
        overlapStart: "2026-09-05T00:00:00.000Z",
        overlapEnd: "2026-09-10T00:00:00.000Z",
      });
    });

    it("reports no conflict for two back-to-back (non-overlapping) assignments", async () => {
      prisma.worker.findMany.mockResolvedValue([
        {
          id: "worker-1",
          name: "Peter Bauer",
          role: "Tiler",
          resourceAssignments: [
            {
              id: "a1",
              startDate: new Date("2026-09-01T00:00:00.000Z"),
              endDate: new Date("2026-09-05T00:00:00.000Z"),
              note: null,
              project: { id: "p1", name: "Site A" },
            },
            {
              id: "a2",
              startDate: new Date("2026-09-06T00:00:00.000Z"),
              endDate: new Date("2026-09-10T00:00:00.000Z"),
              note: null,
              project: { id: "p2", name: "Site B" },
            },
          ],
        },
      ]);

      const result = await service.calendar(COMPANY_A);

      expect(result.conflicts).toEqual([]);
    });
  });
});
