import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { BenefitsService } from "./benefits.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";

describe("BenefitsService", () => {
  let service: BenefitsService;
  let prisma: {
    benefitPlan: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock; update: jest.Mock };
    benefitPlanTier: { findFirst: jest.Mock; create: jest.Mock };
    benefitEnrollment: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock; update: jest.Mock };
    worker: { findFirst: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      benefitPlan: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
      benefitPlanTier: { findFirst: jest.fn(), create: jest.fn() },
      benefitEnrollment: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
      worker: { findFirst: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [
        BenefitsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();

    service = module.get(BenefitsService);
  });

  describe("enrollWorker()", () => {
    it("rejects a worker who doesn't belong to the company", async () => {
      prisma.worker.findFirst.mockResolvedValue(null);

      await expect(
        service.enrollWorker(COMPANY_A, { name: "HR" }, "worker-1", "plan-1", { tierId: "tier-1", effectiveDate: new Date().toISOString() }),
      ).rejects.toThrow(NotFoundException);
    });

    it("rejects a tier that doesn't belong to the given plan", async () => {
      prisma.worker.findFirst.mockResolvedValue({ id: "worker-1", name: "Jane" });
      prisma.benefitPlanTier.findFirst.mockResolvedValue(null);

      await expect(
        service.enrollWorker(COMPANY_A, { name: "HR" }, "worker-1", "plan-1", { tierId: "tier-1", effectiveDate: new Date().toISOString() }),
      ).rejects.toThrow(BadRequestException);
    });

    it("creates the enrollment with dependents", async () => {
      prisma.worker.findFirst.mockResolvedValue({ id: "worker-1", name: "Jane" });
      prisma.benefitPlanTier.findFirst.mockResolvedValue({ id: "tier-1", name: "Family" });
      prisma.benefitEnrollment.create.mockResolvedValue({ id: "enrollment-1" });

      await service.enrollWorker(COMPANY_A, { name: "HR" }, "worker-1", "plan-1", {
        tierId: "tier-1",
        effectiveDate: new Date().toISOString(),
        dependents: [{ name: "Anna", relationship: "spouse" }],
      });

      const call = prisma.benefitEnrollment.create.mock.calls[0][0];
      expect(call.data.dependents.create).toHaveLength(1);
      expect(call.data.dependents.create[0].name).toBe("Anna");
    });
  });

  describe("updateEnrollmentStatus()", () => {
    it("rejects an enrollment that doesn't belong to the company", async () => {
      prisma.benefitEnrollment.findFirst.mockResolvedValue(null);

      await expect(service.updateEnrollmentStatus(COMPANY_A, { name: "HR" }, "enrollment-1", { status: "terminated" })).rejects.toThrow(NotFoundException);
    });

    it("stamps endDate when terminating", async () => {
      prisma.benefitEnrollment.findFirst.mockResolvedValue({ id: "enrollment-1" });
      prisma.benefitEnrollment.update.mockResolvedValue({ id: "enrollment-1", status: "terminated" });

      await service.updateEnrollmentStatus(COMPANY_A, { name: "HR" }, "enrollment-1", { status: "terminated" });

      const call = prisma.benefitEnrollment.update.mock.calls[0][0];
      expect(call.data.endDate).toBeInstanceOf(Date);
    });

    it("leaves endDate untouched for a non-terminating status change", async () => {
      prisma.benefitEnrollment.findFirst.mockResolvedValue({ id: "enrollment-1" });
      prisma.benefitEnrollment.update.mockResolvedValue({ id: "enrollment-1", status: "waived" });

      await service.updateEnrollmentStatus(COMPANY_A, { name: "HR" }, "enrollment-1", { status: "waived" });

      const call = prisma.benefitEnrollment.update.mock.calls[0][0];
      expect(call.data.endDate).toBeUndefined();
    });
  });

  describe("costSummary()", () => {
    it("sums employer and employee cost across active enrollments only", async () => {
      prisma.benefitEnrollment.findMany.mockResolvedValue([
        { tier: { monthlyEmployerCost: 300, monthlyEmployeeCost: 50 }, plan: { type: "medical" } },
        { tier: { monthlyEmployerCost: 100, monthlyEmployeeCost: 20 }, plan: { type: "dental" } },
      ]);

      const result = await service.costSummary(COMPANY_A);

      expect(result.totalMonthlyEmployerCost).toBe(400);
      expect(result.totalMonthlyEmployeeCost).toBe(70);
      expect(result.activeEnrollmentCount).toBe(2);
      expect(prisma.benefitEnrollment.findMany.mock.calls[0][0].where.status).toBe("active");
    });
  });
});
