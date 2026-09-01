import { Test } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { CompanyHolidaysService } from "./company-holidays.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "Admin" };

describe("CompanyHolidaysService", () => {
  let service: CompanyHolidaysService;
  let prisma: {
    companyHoliday: { findMany: jest.Mock; findUnique: jest.Mock; create: jest.Mock; findFirst: jest.Mock; delete: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      companyHoliday: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), findFirst: jest.fn(), delete: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [
        CompanyHolidaysService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();

    service = module.get(CompanyHolidaysService);
  });

  describe("create()", () => {
    it("rejects a duplicate date", async () => {
      prisma.companyHoliday.findUnique.mockResolvedValue({ id: "existing" });
      await expect(service.create(COMPANY_A, ACTOR, { date: "2027-01-01T00:00:00.000Z", label: "New Year" })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.companyHoliday.create).not.toHaveBeenCalled();
    });

    it("creates the holiday", async () => {
      prisma.companyHoliday.findUnique.mockResolvedValue(null);
      prisma.companyHoliday.create.mockResolvedValue({ id: "h-1" });

      await service.create(COMPANY_A, ACTOR, { date: "2027-01-01T00:00:00.000Z", label: "New Year" });

      expect(prisma.companyHoliday.create).toHaveBeenCalledWith({
        data: { companyId: COMPANY_A, date: new Date("2027-01-01T00:00:00.000Z"), label: "New Year" },
      });
    });
  });

  describe("delete()", () => {
    it("404s on a holiday outside the company", async () => {
      prisma.companyHoliday.findFirst.mockResolvedValue(null);
      await expect(service.delete(COMPANY_A, ACTOR, "h-1")).rejects.toThrow(NotFoundException);
    });

    it("deletes the holiday", async () => {
      prisma.companyHoliday.findFirst.mockResolvedValue({ id: "h-1", label: "New Year" });
      await service.delete(COMPANY_A, ACTOR, "h-1");
      expect(prisma.companyHoliday.delete).toHaveBeenCalledWith({ where: { id: "h-1" } });
    });
  });

  describe("holidayDateKeys()", () => {
    it("returns a set of YYYY-MM-DD keys", async () => {
      prisma.companyHoliday.findMany.mockResolvedValue([{ date: new Date("2027-01-01T00:00:00.000Z") }, { date: new Date("2027-12-25T00:00:00.000Z") }]);

      const keys = await service.holidayDateKeys(COMPANY_A);

      expect(keys).toEqual(new Set(["2027-01-01", "2027-12-25"]));
    });
  });
});
