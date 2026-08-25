import { BadRequestException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { CompanyService } from "./company.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { StorageService } from "../common/storage/storage.service";
import { AuditService } from "../common/audit/audit.service";
import { MailService } from "../common/mail/mail.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "owner-1", name: "Jane" };

describe("CompanyService — franchise linking", () => {
  let service: CompanyService;
  let prisma: {
    company: { update: jest.Mock; findUniqueOrThrow: jest.Mock; findUnique: jest.Mock; count: jest.Mock; findMany: jest.Mock };
    invoice: { aggregate: jest.Mock };
    project: { count: jest.Mock };
    membership: { count: jest.Mock };
  };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      company: {
        update: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
      },
      invoice: { aggregate: jest.fn() },
      project: { count: jest.fn() },
      membership: { count: jest.fn() },
    };
    audit = { record: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        CompanyService,
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: {} },
        { provide: AuditService, useValue: audit },
        { provide: MailService, useValue: { send: jest.fn() } },
      ],
    }).compile();

    service = module.get(CompanyService);
  });

  describe("generateFranchiseLinkCode", () => {
    it("stores and returns a fresh code", async () => {
      prisma.company.update.mockResolvedValue({ franchiseLinkCode: "abc123" });

      const result = await service.generateFranchiseLinkCode(COMPANY_A, ACTOR);

      expect(result.franchiseLinkCode).toBe("abc123");
      expect(audit.record).toHaveBeenCalled();
    });
  });

  describe("linkToParent", () => {
    it("refuses when already linked to a parent", async () => {
      prisma.company.findUniqueOrThrow.mockResolvedValue({ id: COMPANY_A, parentCompanyId: "parent-1" });

      await expect(service.linkToParent(COMPANY_A, ACTOR, { code: "abc123" })).rejects.toThrow(BadRequestException);
    });

    it("refuses when this company already has branches of its own", async () => {
      prisma.company.findUniqueOrThrow.mockResolvedValue({ id: COMPANY_A, parentCompanyId: null });
      prisma.company.count.mockResolvedValue(2);

      await expect(service.linkToParent(COMPANY_A, ACTOR, { code: "abc123" })).rejects.toThrow(BadRequestException);
    });

    it("refuses an invalid code", async () => {
      prisma.company.findUniqueOrThrow.mockResolvedValue({ id: COMPANY_A, parentCompanyId: null });
      prisma.company.count.mockResolvedValue(0);
      prisma.company.findUnique.mockResolvedValue(null);

      await expect(service.linkToParent(COMPANY_A, ACTOR, { code: "bad-code" })).rejects.toThrow(BadRequestException);
    });

    it("refuses linking to itself", async () => {
      prisma.company.findUniqueOrThrow.mockResolvedValue({ id: COMPANY_A, parentCompanyId: null });
      prisma.company.count.mockResolvedValue(0);
      prisma.company.findUnique.mockResolvedValue({ id: COMPANY_A, name: "Acme" });

      await expect(service.linkToParent(COMPANY_A, ACTOR, { code: "abc123" })).rejects.toThrow(BadRequestException);
    });

    it("links to the parent found by code", async () => {
      prisma.company.findUniqueOrThrow.mockResolvedValue({ id: COMPANY_A, parentCompanyId: null });
      prisma.company.count.mockResolvedValue(0);
      prisma.company.findUnique.mockResolvedValue({ id: "parent-1", name: "Acme HQ" });
      prisma.company.update.mockResolvedValue({ id: COMPANY_A, parentCompanyId: "parent-1" });

      const result = await service.linkToParent(COMPANY_A, ACTOR, { code: "abc123" });

      expect(result.parentCompanyId).toBe("parent-1");
      expect(prisma.company.update).toHaveBeenCalledWith({ where: { id: COMPANY_A }, data: { parentCompanyId: "parent-1" } });
    });
  });

  describe("franchiseOverview", () => {
    it("returns an empty list when this company has no branches", async () => {
      prisma.company.findMany.mockResolvedValue([]);

      const result = await service.franchiseOverview(COMPANY_A);

      expect(result).toEqual({ branches: [] });
    });

    it("aggregates revenue, projects, and members per branch plus totals", async () => {
      prisma.company.findMany.mockResolvedValue([{ id: "child-1", name: "Branch A" }]);
      prisma.invoice.aggregate.mockResolvedValue({ _sum: { total: "500" } });
      prisma.project.count.mockResolvedValue(3);
      prisma.membership.count.mockResolvedValue(4);

      const result = await service.franchiseOverview(COMPANY_A);

      expect(result.branches).toEqual([{ companyId: "child-1", name: "Branch A", revenue: 500, projectCount: 3, memberCount: 4 }]);
      expect(result.totals).toEqual({ revenue: 500, projectCount: 3, memberCount: 4 });
    });
  });
});
