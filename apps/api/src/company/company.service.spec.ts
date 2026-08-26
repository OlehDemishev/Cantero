import { Test } from "@nestjs/testing";
import { CompanyService } from "./company.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { StorageService } from "../common/storage/storage.service";
import { AuditService } from "../common/audit/audit.service";
import { MailService } from "../common/mail/mail.service";
import { ExchangeRateService } from "../common/exchange-rate/exchange-rate.service";

const COMPANY_A = "company-a";

describe("CompanyService — referral program", () => {
  let service: CompanyService;
  let prisma: {
    company: { findUniqueOrThrow: jest.Mock; update: jest.Mock; count: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      company: { findUniqueOrThrow: jest.fn(), update: jest.fn(), count: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [
        CompanyService,
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: {} },
        { provide: AuditService, useValue: { record: jest.fn() } },
        { provide: MailService, useValue: {} },
        { provide: ExchangeRateService, useValue: {} },
      ],
    }).compile();

    service = module.get(CompanyService);
  });

  describe("get()", () => {
    it("returns the company as-is when it already has a referralCode", async () => {
      prisma.company.findUniqueOrThrow.mockResolvedValue({ id: COMPANY_A, referralCode: "existing" });

      const result = await service.get(COMPANY_A);

      expect(result.referralCode).toBe("existing");
      expect(prisma.company.update).not.toHaveBeenCalled();
    });

    it("backfills a referralCode for a company that predates the referral program", async () => {
      prisma.company.findUniqueOrThrow.mockResolvedValue({ id: COMPANY_A, referralCode: null });
      prisma.company.update.mockResolvedValue({ id: COMPANY_A, referralCode: "backfilled" });

      const result = await service.get(COMPANY_A);

      expect(prisma.company.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: COMPANY_A }, data: expect.objectContaining({ referralCode: expect.any(String) }) }),
      );
      expect(result.referralCode).toBe("backfilled");
    });
  });

  describe("referralStats()", () => {
    it("counts companies referred by this one", async () => {
      prisma.company.count.mockResolvedValue(3);

      const result = await service.referralStats(COMPANY_A);

      expect(prisma.company.count).toHaveBeenCalledWith({ where: { referredByCompanyId: COMPANY_A } });
      expect(result).toEqual({ referredCount: 3 });
    });
  });
});
