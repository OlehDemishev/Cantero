import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { WorkersService } from "./workers.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "PM" };

describe("WorkersService certifications", () => {
  let service: WorkersService;
  let prisma: {
    worker: { findFirst: jest.Mock };
    workerCertification: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; delete: jest.Mock };
  };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      worker: { findFirst: jest.fn() },
      workerCertification: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), delete: jest.fn() },
    };
    audit = { record: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [WorkersService, { provide: PrismaService, useValue: prisma }, { provide: AuditService, useValue: audit }],
    }).compile();

    service = module.get(WorkersService);
  });

  describe("addCertification()", () => {
    it("rejects when the worker does not belong to this company", async () => {
      prisma.worker.findFirst.mockResolvedValue(null);

      await expect(
        service.addCertification(COMPANY_A, ACTOR, "worker-1", { name: "OSHA 30", expiresAt: "2027-01-01T00:00:00.000Z" }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.workerCertification.create).not.toHaveBeenCalled();
    });

    it("records an audit entry on success", async () => {
      prisma.worker.findFirst.mockResolvedValue({ id: "worker-1", companyId: COMPANY_A, name: "Peter Bauer" });
      prisma.workerCertification.create.mockResolvedValue({ id: "cert-1", expiresAt: new Date("2027-01-01T00:00:00.000Z") });

      await service.addCertification(COMPANY_A, ACTOR, "worker-1", { name: "OSHA 30", expiresAt: "2027-01-01T00:00:00.000Z" });

      expect(audit.record).toHaveBeenCalled();
    });
  });

  describe("deleteCertification()", () => {
    it("rejects deleting a certification that doesn't belong to this company's worker", async () => {
      prisma.workerCertification.findFirst.mockResolvedValue(null);

      await expect(service.deleteCertification(COMPANY_A, "worker-1", "cert-1")).rejects.toThrow(NotFoundException);
      expect(prisma.workerCertification.delete).not.toHaveBeenCalled();
    });

    it("deletes when it belongs to this company's worker", async () => {
      prisma.workerCertification.findFirst.mockResolvedValue({ id: "cert-1", workerId: "worker-1", companyId: COMPANY_A });
      prisma.workerCertification.delete.mockResolvedValue({});

      const result = await service.deleteCertification(COMPANY_A, "worker-1", "cert-1");

      expect(result).toEqual({ ok: true });
      expect(prisma.workerCertification.delete).toHaveBeenCalledWith({ where: { id: "cert-1" } });
    });
  });

  describe("certificationsDashboard()", () => {
    it("buckets certifications into expired / expiring_soon / valid", async () => {
      const now = new Date();
      const expired = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const soon = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);
      const farOut = new Date(now.getTime() + 200 * 24 * 60 * 60 * 1000);

      prisma.workerCertification.findMany.mockResolvedValue([
        { id: "c1", name: "OSHA 10", expiresAt: expired, worker: { id: "w1", name: "Sam", role: "foreman" } },
        { id: "c2", name: "First Aid", expiresAt: soon, worker: { id: "w2", name: "Alex", role: "worker" } },
        { id: "c3", name: "Crane Op", expiresAt: farOut, worker: { id: "w3", name: "Lee", role: "worker" } },
      ]);

      const result = await service.certificationsDashboard(COMPANY_A);

      expect(result.summary).toEqual({ expired: 1, expiringSoon: 1, valid: 1 });
      expect(result.certifications.find((c) => c.id === "c1")?.status).toBe("expired");
      expect(result.certifications.find((c) => c.id === "c2")?.status).toBe("expiring_soon");
      expect(result.certifications.find((c) => c.id === "c3")?.status).toBe("valid");
    });
  });
});
