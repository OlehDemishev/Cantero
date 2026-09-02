import { BadRequestException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { CompanyService } from "./company.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { StorageService } from "../common/storage/storage.service";
import { AuditService } from "../common/audit/audit.service";
import { MailService } from "../common/mail/mail.service";
import { ExchangeRateService } from "../common/exchange-rate/exchange-rate.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "owner-1", name: "Jane" };

describe("CompanyService — franchise linking", () => {
  let service: CompanyService;
  let prisma: {
    company: { update: jest.Mock; findUniqueOrThrow: jest.Mock; findUnique: jest.Mock; count: jest.Mock; findMany: jest.Mock };
    invoice: { aggregate: jest.Mock };
    project: { count: jest.Mock };
    membership: { count: jest.Mock };
    stockMovement: { findMany: jest.Mock };
    timeEntry: { findMany: jest.Mock };
    subcontractorCost: { findMany: jest.Mock };
  };
  let audit: { record: jest.Mock };
  let exchangeRates: { convert: jest.Mock };

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
      stockMovement: { findMany: jest.fn().mockResolvedValue([]) },
      timeEntry: { findMany: jest.fn().mockResolvedValue([]) },
      subcontractorCost: { findMany: jest.fn().mockResolvedValue([]) },
    };
    audit = { record: jest.fn() };
    // Identity conversion by default — tests that care about real conversion override this.
    exchangeRates = { convert: jest.fn((amount: number) => Promise.resolve(amount)) };

    const module = await Test.createTestingModule({
      providers: [
        CompanyService,
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: {} },
        { provide: AuditService, useValue: audit },
        { provide: MailService, useValue: { send: jest.fn() } },
        { provide: ExchangeRateService, useValue: exchangeRates },
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
      prisma.company.findUniqueOrThrow.mockResolvedValue({ id: COMPANY_A, currency: "EUR", reportingCurrency: null });
      prisma.company.findMany.mockResolvedValue([]);

      const result = await service.franchiseOverview(COMPANY_A);

      expect(result).toEqual({ branches: [], reportingCurrency: "EUR" });
    });

    it("aggregates revenue, projects, and members per branch plus totals, in the same currency", async () => {
      prisma.company.findUniqueOrThrow.mockResolvedValue({ id: COMPANY_A, currency: "EUR", reportingCurrency: null });
      prisma.company.findMany.mockResolvedValue([{ id: "child-1", name: "Branch A", currency: "EUR" }]);
      prisma.invoice.aggregate.mockResolvedValue({ _sum: { total: "500" } });
      prisma.project.count.mockResolvedValue(3);
      prisma.membership.count.mockResolvedValue(4);

      const result = await service.franchiseOverview(COMPANY_A);

      expect(result.branches).toEqual([
        {
          companyId: "child-1",
          name: "Branch A",
          currency: "EUR",
          revenue: 500,
          revenueConverted: 500,
          materialsCost: 0,
          laborCost: 0,
          subcontractorCost: 0,
          costConverted: 0,
          marginConverted: 500,
          projectCount: 3,
          memberCount: 4,
        },
      ]);
      expect(result.totals).toEqual({ revenue: 500, cost: 0, margin: 500, projectCount: 3, memberCount: 4 });
    });

    it("computes margin as revenue minus materials/labor/subcontractor cost", async () => {
      prisma.company.findUniqueOrThrow.mockResolvedValue({ id: COMPANY_A, currency: "EUR", reportingCurrency: null });
      prisma.company.findMany.mockResolvedValue([{ id: "child-1", name: "Branch A", currency: "EUR" }]);
      prisma.invoice.aggregate.mockResolvedValue({ _sum: { total: "10000" } });
      prisma.project.count.mockResolvedValue(1);
      prisma.membership.count.mockResolvedValue(1);
      prisma.stockMovement.findMany.mockResolvedValue([{ quantity: "10", materialCatalogItem: { defaultUnitPrice: "100" } }]);
      prisma.timeEntry.findMany.mockResolvedValue([{ hours: "8", hourlyCostSnapshot: "25", worker: { hourlyCost: null } }]);
      prisma.subcontractorCost.findMany.mockResolvedValue([{ amount: "500" }]);

      const result = await service.franchiseOverview(COMPANY_A);

      const branch = result.branches[0];
      expect(branch.materialsCost).toBe(1000);
      expect(branch.laborCost).toBe(200);
      expect(branch.subcontractorCost).toBe(500);
      expect(branch.costConverted).toBe(1700);
      expect(branch.marginConverted).toBe(8300);
      expect(result.totals?.margin).toBe(8300);
    });

    it("converts each branch's revenue into the parent's reporting currency before summing", async () => {
      prisma.company.findUniqueOrThrow.mockResolvedValue({ id: COMPANY_A, currency: "EUR", reportingCurrency: null });
      prisma.company.findMany.mockResolvedValue([{ id: "child-1", name: "Branch USD", currency: "USD" }]);
      prisma.invoice.aggregate.mockResolvedValue({ _sum: { total: "100" } });
      prisma.project.count.mockResolvedValue(1);
      prisma.membership.count.mockResolvedValue(1);
      exchangeRates.convert.mockResolvedValue(93); // 100 USD -> 93 EUR, say

      const result = await service.franchiseOverview(COMPANY_A);

      expect(exchangeRates.convert).toHaveBeenCalledWith(100, "USD", "EUR");
      expect(result.branches[0].revenueConverted).toBe(93);
      expect(result.totals!.revenue).toBe(93);
    });
  });
});
