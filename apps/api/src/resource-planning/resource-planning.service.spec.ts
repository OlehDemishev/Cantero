import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ResourcePlanningService } from "./resource-planning.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";
import { SmsService } from "../common/sms/sms.service";
import { MessageTemplatesService } from "../message-templates/message-templates.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "PM" };

describe("ResourcePlanningService", () => {
  let service: ResourcePlanningService;
  let prisma: {
    worker: { findMany: jest.Mock; findFirst: jest.Mock; count: jest.Mock };
    equipment: { findMany: jest.Mock; findFirst: jest.Mock };
    project: { findFirst: jest.Mock };
    task: { findFirst: jest.Mock };
    resourceAssignment: { create: jest.Mock; findMany: jest.Mock; findFirst: jest.Mock; delete: jest.Mock };
    crew: { findMany: jest.Mock; findFirst: jest.Mock; findFirstOrThrow: jest.Mock; create: jest.Mock; delete: jest.Mock };
    crewMember: { deleteMany: jest.Mock; createMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let audit: { record: jest.Mock };
  let sms: { send: jest.Mock };

  beforeEach(async () => {
    prisma = {
      worker: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn(), count: jest.fn() },
      equipment: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
      project: { findFirst: jest.fn() },
      task: { findFirst: jest.fn() },
      resourceAssignment: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn(), delete: jest.fn() },
      crew: { findMany: jest.fn(), findFirst: jest.fn(), findFirstOrThrow: jest.fn(), create: jest.fn(), delete: jest.fn() },
      crewMember: { deleteMany: jest.fn(), createMany: jest.fn() },
      $transaction: jest.fn((arg) => (Array.isArray(arg) ? Promise.all(arg) : arg())),
    };
    audit = { record: jest.fn() };
    sms = { send: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        ResourcePlanningService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: SmsService, useValue: sms },
        { provide: MessageTemplatesService, useValue: { render: jest.fn().mockResolvedValue(null) } },
      ],
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

  describe("create() — task-assignment SMS", () => {
    beforeEach(() => {
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
      prisma.task.findFirst.mockResolvedValue({ id: "task-1", name: "Frame the west wall" });
    });

    it("texts the worker when the company has SMS enabled, a task is linked, and the worker has a phone", async () => {
      prisma.project.findFirst.mockResolvedValue({
        id: "project-1",
        name: "Site A",
        company: { workerSmsNotificationsEnabled: true, locale: "en" },
      });
      prisma.worker.findFirst.mockResolvedValue({ id: "worker-1", phone: "+15551234567", preferredLocale: "es" });

      await service.create(COMPANY_A, ACTOR, {
        projectId: "project-1",
        workerId: "worker-1",
        taskId: "task-1",
        startDate: "2026-09-01T00:00:00.000Z",
        endDate: "2026-09-05T00:00:00.000Z",
      });

      expect(sms.send).toHaveBeenCalledTimes(1);
      expect(sms.send.mock.calls[0][0].to).toBe("+15551234567");
      // preferredLocale "es" should win over the company's "en" locale.
      expect(sms.send.mock.calls[0][0].body).toContain("Frame the west wall");
      expect(sms.send.mock.calls[0][0].body).toMatch(/tarea/i);
    });

    it("does not text when the company has SMS notifications disabled", async () => {
      prisma.project.findFirst.mockResolvedValue({
        id: "project-1",
        name: "Site A",
        company: { workerSmsNotificationsEnabled: false, locale: "en" },
      });
      prisma.worker.findFirst.mockResolvedValue({ id: "worker-1", phone: "+15551234567", preferredLocale: null });

      await service.create(COMPANY_A, ACTOR, {
        projectId: "project-1",
        workerId: "worker-1",
        taskId: "task-1",
        startDate: "2026-09-01T00:00:00.000Z",
        endDate: "2026-09-05T00:00:00.000Z",
      });

      expect(sms.send).not.toHaveBeenCalled();
    });

    it("does not text when the worker has no phone on file", async () => {
      prisma.project.findFirst.mockResolvedValue({
        id: "project-1",
        name: "Site A",
        company: { workerSmsNotificationsEnabled: true, locale: "en" },
      });
      prisma.worker.findFirst.mockResolvedValue({ id: "worker-1", phone: null, preferredLocale: null });

      await service.create(COMPANY_A, ACTOR, {
        projectId: "project-1",
        workerId: "worker-1",
        taskId: "task-1",
        startDate: "2026-09-01T00:00:00.000Z",
        endDate: "2026-09-05T00:00:00.000Z",
      });

      expect(sms.send).not.toHaveBeenCalled();
    });

    it("does not text when the assignment has no linked task", async () => {
      prisma.project.findFirst.mockResolvedValue({
        id: "project-1",
        name: "Site A",
        company: { workerSmsNotificationsEnabled: true, locale: "en" },
      });
      prisma.worker.findFirst.mockResolvedValue({ id: "worker-1", phone: "+15551234567", preferredLocale: null });

      await service.create(COMPANY_A, ACTOR, {
        projectId: "project-1",
        workerId: "worker-1",
        startDate: "2026-09-01T00:00:00.000Z",
        endDate: "2026-09-05T00:00:00.000Z",
      });

      expect(sms.send).not.toHaveBeenCalled();
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

  describe("workloadHeatmap()", () => {
    it("assumes 8h for each day a single assignment spans", async () => {
      prisma.resourceAssignment.findMany.mockResolvedValue([
        {
          startDate: new Date("2026-09-01T00:00:00.000Z"),
          endDate: new Date("2026-09-03T00:00:00.000Z"),
          worker: { id: "w-1", name: "Peter Bauer" },
        },
      ]);

      const result = await service.workloadHeatmap(COMPANY_A, new Date("2026-09-01"), new Date("2026-09-10"));

      expect(result).toHaveLength(1);
      expect(result[0].days).toEqual([
        { date: "2026-09-01", hours: 8, overallocated: false },
        { date: "2026-09-02", hours: 8, overallocated: false },
        { date: "2026-09-03", hours: 8, overallocated: false },
      ]);
    });

    it("flags a day as overallocated when two assignments overlap on it", async () => {
      prisma.resourceAssignment.findMany.mockResolvedValue([
        { startDate: new Date("2026-09-01T00:00:00.000Z"), endDate: new Date("2026-09-02T00:00:00.000Z"), worker: { id: "w-1", name: "Peter Bauer" } },
        { startDate: new Date("2026-09-02T00:00:00.000Z"), endDate: new Date("2026-09-03T00:00:00.000Z"), worker: { id: "w-1", name: "Peter Bauer" } },
      ]);

      const result = await service.workloadHeatmap(COMPANY_A, new Date("2026-09-01"), new Date("2026-09-10"));
      const sep2 = result[0].days.find((d) => d.date === "2026-09-02");

      expect(sep2?.hours).toBe(16);
      expect(sep2?.overallocated).toBe(true);
    });

    it("ignores equipment-only assignments (no worker)", async () => {
      prisma.resourceAssignment.findMany.mockResolvedValue([
        { startDate: new Date("2026-09-01T00:00:00.000Z"), endDate: new Date("2026-09-01T00:00:00.000Z"), worker: null },
      ]);

      const result = await service.workloadHeatmap(COMPANY_A, new Date("2026-09-01"), new Date("2026-09-10"));

      expect(result).toEqual([]);
    });
  });

  describe("createCrew()", () => {
    it("rejects a workerId that doesn't belong to this company", async () => {
      prisma.worker.count.mockResolvedValue(1); // only 1 of 2 requested workers found

      await expect(service.createCrew(COMPANY_A, ACTOR, { name: "Framing A", workerIds: ["w-1", "w-2"] })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.crew.create).not.toHaveBeenCalled();
    });

    it("creates the crew with its members", async () => {
      prisma.worker.count.mockResolvedValue(2);
      prisma.crew.create.mockResolvedValue({ id: "crew-1", name: "Framing A" });

      await service.createCrew(COMPANY_A, ACTOR, { name: "Framing A", workerIds: ["w-1", "w-2"] });

      expect(prisma.crew.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ companyId: COMPANY_A, name: "Framing A", members: { create: [{ workerId: "w-1" }, { workerId: "w-2" }] } }),
        }),
      );
      expect(audit.record).toHaveBeenCalled();
    });
  });

  describe("updateCrewMembers()", () => {
    it("rejects a crew that doesn't belong to this company", async () => {
      prisma.crew.findFirst.mockResolvedValue(null);

      await expect(service.updateCrewMembers(COMPANY_A, "crew-1", { workerIds: ["w-1"] })).rejects.toThrow(NotFoundException);
    });

    it("replaces the member list transactionally", async () => {
      prisma.crew.findFirst.mockResolvedValue({ id: "crew-1", companyId: COMPANY_A });
      prisma.worker.count.mockResolvedValue(1);
      prisma.crew.findFirstOrThrow.mockResolvedValue({ id: "crew-1", members: [] });

      await service.updateCrewMembers(COMPANY_A, "crew-1", { workerIds: ["w-1"] });

      expect(prisma.crewMember.deleteMany).toHaveBeenCalledWith({ where: { crewId: "crew-1" } });
      expect(prisma.crewMember.createMany).toHaveBeenCalledWith({ data: [{ crewId: "crew-1", workerId: "w-1" }] });
    });
  });

  describe("assignCrew()", () => {
    it("rejects a crew that doesn't belong to this company", async () => {
      prisma.crew.findFirst.mockResolvedValue(null);

      await expect(
        service.assignCrew(COMPANY_A, ACTOR, { crewId: "crew-1", projectId: "project-1", startDate: "2026-09-01T00:00:00.000Z", endDate: "2026-09-05T00:00:00.000Z" }),
      ).rejects.toThrow(NotFoundException);
    });

    it("rejects a crew with no members", async () => {
      prisma.crew.findFirst.mockResolvedValue({ id: "crew-1", companyId: COMPANY_A, name: "Empty Crew", members: [] });

      await expect(
        service.assignCrew(COMPANY_A, ACTOR, { crewId: "crew-1", projectId: "project-1", startDate: "2026-09-01T00:00:00.000Z", endDate: "2026-09-05T00:00:00.000Z" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("creates one assignment per crew member, tagged with the crew, and reports any conflicts", async () => {
      prisma.crew.findFirst.mockResolvedValue({
        id: "crew-1",
        companyId: COMPANY_A,
        name: "Framing A",
        members: [{ workerId: "w-1" }, { workerId: "w-2" }],
      });
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", name: "Site A" });
      prisma.resourceAssignment.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: `assign-${data.workerId}`, ...data }),
      );
      prisma.resourceAssignment.findMany.mockResolvedValue([]); // no existing conflicting assignments

      const result = await service.assignCrew(COMPANY_A, ACTOR, {
        crewId: "crew-1",
        projectId: "project-1",
        startDate: "2026-09-01T00:00:00.000Z",
        endDate: "2026-09-05T00:00:00.000Z",
      });

      expect(result.assignments).toHaveLength(2);
      expect(result.conflicts).toEqual([]);
      expect(prisma.resourceAssignment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ crewId: "crew-1", workerId: "w-1" }) }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        COMPANY_A,
        ACTOR,
        "crew.assigned",
        "Crew",
        "crew-1",
        expect.stringContaining("2 workers"),
      );
    });
  });
});
