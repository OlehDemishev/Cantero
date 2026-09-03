import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { TrainingService } from "./training.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";

describe("TrainingService", () => {
  let service: TrainingService;
  let prisma: {
    trainingCourse: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock; update: jest.Mock; delete: jest.Mock };
    trainingEnrollment: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock; update: jest.Mock };
    worker: { findFirst: jest.Mock; findMany: jest.Mock };
    workerCertification: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      trainingCourse: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
      trainingEnrollment: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
      worker: { findFirst: jest.fn(), findMany: jest.fn() },
      workerCertification: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [
        TrainingService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();

    service = module.get(TrainingService);
  });

  describe("enroll()", () => {
    it("rejects enrolling a worker who doesn't belong to the company", async () => {
      prisma.trainingCourse.findFirst.mockResolvedValue({ id: "course-1", title: "OSHA 10" });
      prisma.worker.findFirst.mockResolvedValue(null);

      await expect(service.enroll(COMPANY_A, { name: "Owner" }, "course-1", { workerId: "w1" })).rejects.toThrow(NotFoundException);
    });

    it("rejects enrolling a worker who is already actively enrolled", async () => {
      prisma.trainingCourse.findFirst.mockResolvedValue({ id: "course-1", title: "OSHA 10" });
      prisma.worker.findFirst.mockResolvedValue({ id: "w1", name: "Jane" });
      prisma.trainingEnrollment.findFirst.mockResolvedValue({ id: "enrollment-1" });

      await expect(service.enroll(COMPANY_A, { name: "Owner" }, "course-1", { workerId: "w1" })).rejects.toThrow(BadRequestException);
    });

    it("enrolls a worker in a course", async () => {
      prisma.trainingCourse.findFirst.mockResolvedValue({ id: "course-1", title: "OSHA 10" });
      prisma.worker.findFirst.mockResolvedValue({ id: "w1", name: "Jane" });
      prisma.trainingEnrollment.findFirst.mockResolvedValue(null);
      prisma.trainingEnrollment.create.mockResolvedValue({ id: "enrollment-1", courseId: "course-1", workerId: "w1" });

      const result = await service.enroll(COMPANY_A, { name: "Owner" }, "course-1", { workerId: "w1" });

      expect(result.id).toBe("enrollment-1");
    });
  });

  describe("complete()", () => {
    it("rejects completing an enrollment twice", async () => {
      prisma.trainingEnrollment.findFirst.mockResolvedValue({
        id: "enrollment-1",
        status: "completed",
        course: { title: "OSHA 10", validityMonths: 12 },
        worker: { name: "Jane" },
      });

      await expect(service.complete(COMPANY_A, { name: "Owner" }, "enrollment-1", {})).rejects.toThrow(BadRequestException);
    });

    it("auto-issues a WorkerCertification when the course has a validityMonths and none exists yet", async () => {
      prisma.trainingEnrollment.findFirst.mockResolvedValue({
        id: "enrollment-1",
        status: "enrolled",
        workerId: "w1",
        course: { title: "OSHA 10", validityMonths: 12 },
        worker: { name: "Jane" },
      });
      prisma.trainingEnrollment.update.mockResolvedValue({ id: "enrollment-1", status: "completed" });
      prisma.workerCertification.findFirst.mockResolvedValue(null);

      await service.complete(COMPANY_A, { name: "Owner" }, "enrollment-1", { score: 95 });

      expect(prisma.workerCertification.create).toHaveBeenCalled();
      const call = prisma.workerCertification.create.mock.calls[0][0];
      expect(call.data.name).toBe("OSHA 10");
    });

    it("renews an existing WorkerCertification instead of creating a duplicate", async () => {
      prisma.trainingEnrollment.findFirst.mockResolvedValue({
        id: "enrollment-1",
        status: "enrolled",
        workerId: "w1",
        course: { title: "OSHA 10", validityMonths: 12 },
        worker: { name: "Jane" },
      });
      prisma.trainingEnrollment.update.mockResolvedValue({ id: "enrollment-1", status: "completed" });
      prisma.workerCertification.findFirst.mockResolvedValue({ id: "cert-1" });

      await service.complete(COMPANY_A, { name: "Owner" }, "enrollment-1", {});

      expect(prisma.workerCertification.create).not.toHaveBeenCalled();
      expect(prisma.workerCertification.update).toHaveBeenCalledWith({ where: { id: "cert-1" }, data: { expiresAt: expect.any(Date) } });
    });

    it("does not touch WorkerCertification when the course has no validityMonths", async () => {
      prisma.trainingEnrollment.findFirst.mockResolvedValue({
        id: "enrollment-1",
        status: "enrolled",
        workerId: "w1",
        course: { title: "Site Orientation", validityMonths: null },
        worker: { name: "Jane" },
      });
      prisma.trainingEnrollment.update.mockResolvedValue({ id: "enrollment-1", status: "completed" });

      await service.complete(COMPANY_A, { name: "Owner" }, "enrollment-1", {});

      expect(prisma.workerCertification.create).not.toHaveBeenCalled();
      expect(prisma.workerCertification.update).not.toHaveBeenCalled();
    });
  });

  describe("complianceGaps()", () => {
    it("lists active workers who haven't completed each course", async () => {
      prisma.trainingCourse.findMany.mockResolvedValue([{ id: "course-1", title: "OSHA 10" }]);
      prisma.worker.findMany.mockResolvedValue([
        { id: "w1", name: "Jane" },
        { id: "w2", name: "Bob" },
      ]);
      prisma.trainingEnrollment.findMany.mockResolvedValue([{ workerId: "w1", courseId: "course-1" }]);

      const result = await service.complianceGaps(COMPANY_A);

      expect(result).toHaveLength(1);
      expect(result[0].missingWorkers).toEqual([{ workerId: "w2", workerName: "Bob" }]);
    });
  });
});
