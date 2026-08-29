import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { WageClassificationsService } from "./wage-classifications.service";
import { PrismaService } from "../common/prisma/prisma.service";

const COMPANY_A = "company-a";

describe("WageClassificationsService", () => {
  let service: WageClassificationsService;
  let prisma: {
    wageClassification: { findMany: jest.Mock; create: jest.Mock; update: jest.Mock; delete: jest.Mock; findFirst: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      wageClassification: { findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(), findFirst: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [WageClassificationsService, { provide: PrismaService, useValue: prisma }],
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
});
