import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { WageClassificationsService } from "./wage-classifications.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "Owner" };

describe("WageClassificationsService", () => {
  let service: WageClassificationsService;
  let prisma: {
    wageClassification: { findMany: jest.Mock; create: jest.Mock; update: jest.Mock; delete: jest.Mock; findFirst: jest.Mock };
    fringeBenefitFund: { create: jest.Mock; findFirst: jest.Mock; delete: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      wageClassification: { findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(), findFirst: jest.fn() },
      fringeBenefitFund: { create: jest.fn(), findFirst: jest.fn(), delete: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [
        WageClassificationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();

    service = module.get(WageClassificationsService);
  });

  it("creates a classification scoped to the caller's company", async () => {
    prisma.wageClassification.create.mockResolvedValue({ id: "wc-1" });
    await service.create(COMPANY_A, { trade: "Electrician", hourlyRate: 42.5, fringeRate: 9.2 });
    expect(prisma.wageClassification.create).toHaveBeenCalledWith({
      data: { companyId: COMPANY_A, trade: "Electrician", hourlyRate: 42.5, fringeRate: 9.2 },
    });
  });

  it("throws when updating a classification that doesn't belong to the caller's company", async () => {
    prisma.wageClassification.findFirst.mockResolvedValue(null);
    await expect(service.update(COMPANY_A, "wc-1", { hourlyRate: 50 })).rejects.toThrow(NotFoundException);
    expect(prisma.wageClassification.update).not.toHaveBeenCalled();
  });

  it("throws when deleting a classification that doesn't belong to the caller's company", async () => {
    prisma.wageClassification.findFirst.mockResolvedValue(null);
    await expect(service.delete(COMPANY_A, "wc-1")).rejects.toThrow(NotFoundException);
    expect(prisma.wageClassification.delete).not.toHaveBeenCalled();
  });

  describe("addFringeFund()", () => {
    it("throws when the classification doesn't belong to the caller's company", async () => {
      prisma.wageClassification.findFirst.mockResolvedValue(null);
      await expect(
        service.addFringeFund(COMPANY_A, ACTOR, "wc-1", { fundType: "pension", name: "IBEW Pension", ratePerHour: 3 }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.fringeBenefitFund.create).not.toHaveBeenCalled();
    });

    it("creates a fund scoped to the classification and company", async () => {
      prisma.wageClassification.findFirst.mockResolvedValue({ id: "wc-1", trade: "Electrician" });
      prisma.fringeBenefitFund.create.mockResolvedValue({ id: "fund-1" });

      await service.addFringeFund(COMPANY_A, ACTOR, "wc-1", { fundType: "health", name: "IBEW Health", ratePerHour: 2 });

      expect(prisma.fringeBenefitFund.create).toHaveBeenCalledWith({
        data: { companyId: COMPANY_A, wageClassificationId: "wc-1", fundType: "health", name: "IBEW Health", ratePerHour: 2 },
      });
    });
  });

  describe("deleteFringeFund()", () => {
    it("throws when the fund doesn't belong to the caller's company", async () => {
      prisma.fringeBenefitFund.findFirst.mockResolvedValue(null);
      await expect(service.deleteFringeFund(COMPANY_A, "fund-1")).rejects.toThrow(NotFoundException);
      expect(prisma.fringeBenefitFund.delete).not.toHaveBeenCalled();
    });
  });
});
