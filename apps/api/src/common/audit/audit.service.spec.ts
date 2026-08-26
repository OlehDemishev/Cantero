import { Test } from "@nestjs/testing";
import { AuditService } from "./audit.service";
import { PrismaService } from "../prisma/prisma.service";

const COMPANY_A = "company-a";

describe("AuditService", () => {
  let service: AuditService;
  let prisma: { auditLog: { findMany: jest.Mock } };

  beforeEach(async () => {
    prisma = { auditLog: { findMany: jest.fn().mockResolvedValue([]) } };

    const module = await Test.createTestingModule({
      providers: [AuditService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(AuditService);
  });

  describe("list()", () => {
    it("scopes to the company alone when no filter is given", async () => {
      await service.list(COMPANY_A, 50);

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { companyId: COMPANY_A } }),
      );
    });

    it("applies dateFrom/dateTo/entityType/action/actorUserId together", async () => {
      const dateFrom = new Date("2026-01-01");
      const dateTo = new Date("2026-02-01");

      await service.list(COMPANY_A, 50, undefined, { dateFrom, dateTo, entityType: "Project", action: "project.created", actorUserId: "u1" });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            companyId: COMPANY_A,
            createdAt: { gte: dateFrom, lte: dateTo },
            entityType: "Project",
            action: "project.created",
            actorUserId: "u1",
          },
        }),
      );
    });
  });

  describe("exportCsv()", () => {
    it("produces a CSV header even with zero rows", async () => {
      const csv = await service.exportCsv(COMPANY_A);

      expect(csv.split("\n")[0]).toBe("Date,Actor,Action,Entity type,Entity ID,Summary");
    });

    it("includes each audit row as a CSV line", async () => {
      prisma.auditLog.findMany.mockResolvedValue([
        {
          createdAt: new Date("2026-03-01T00:00:00Z"),
          actorName: "Jane",
          action: "project.created",
          entityType: "Project",
          entityId: "p1",
          summary: "Created project",
        },
      ]);

      const csv = await service.exportCsv(COMPANY_A);

      expect(csv).toContain("Jane");
      expect(csv).toContain("project.created");
      expect(csv).toContain("Created project");
    });
  });
});
