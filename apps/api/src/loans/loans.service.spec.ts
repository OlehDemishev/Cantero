import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { LoansService } from "./loans.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";

describe("LoansService", () => {
  let service: LoansService;
  let prisma: {
    loan: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock; update: jest.Mock };
    loanPayment: { findFirst: jest.Mock; count: jest.Mock; update: jest.Mock };
    equipment: { findFirst: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      loan: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
      loanPayment: { findFirst: jest.fn(), count: jest.fn(), update: jest.fn() },
      equipment: { findFirst: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [
        LoansService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();

    service = module.get(LoansService);
  });

  describe("create()", () => {
    it("rejects equipment that doesn't belong to the company", async () => {
      prisma.equipment.findFirst.mockResolvedValue(null);

      await expect(
        service.create(COMPANY_A, { name: "Owner" }, {
          equipmentId: "eq-1",
          lenderName: "Bank",
          principal: 10000,
          interestRatePercent: 5,
          termMonths: 12,
          startDate: new Date().toISOString(),
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("creates the loan with a generated amortization schedule", async () => {
      prisma.loan.create.mockResolvedValue({ id: "loan-1", payments: Array(12).fill({}) });

      await service.create(COMPANY_A, { name: "Owner" }, {
        lenderName: "Bank",
        principal: 12000,
        interestRatePercent: 6,
        termMonths: 12,
        startDate: new Date().toISOString(),
      });

      const call = prisma.loan.create.mock.calls[0][0];
      expect(call.data.payments.create).toHaveLength(12);
    });
  });

  describe("recordPayment()", () => {
    it("rejects recording a payment twice", async () => {
      prisma.loanPayment.findFirst.mockResolvedValue({ id: "p1", loanId: "loan-1", paidAt: new Date() });

      await expect(service.recordPayment(COMPANY_A, { name: "Owner" }, "p1", { paidAmount: 500 })).rejects.toThrow(BadRequestException);
    });

    it("marks the loan paid_off once every payment is recorded", async () => {
      prisma.loanPayment.findFirst.mockResolvedValue({ id: "p1", loanId: "loan-1", paidAt: null });
      prisma.loanPayment.update.mockResolvedValue({ id: "p1", paidAt: new Date(), paidAmount: 500 });
      prisma.loanPayment.count.mockResolvedValue(0);

      await service.recordPayment(COMPANY_A, { name: "Owner" }, "p1", { paidAmount: 500 });

      expect(prisma.loan.update).toHaveBeenCalledWith({ where: { id: "loan-1" }, data: { status: "paid_off" } });
    });

    it("leaves the loan active while payments remain unpaid", async () => {
      prisma.loanPayment.findFirst.mockResolvedValue({ id: "p1", loanId: "loan-1", paidAt: null });
      prisma.loanPayment.update.mockResolvedValue({ id: "p1", paidAt: new Date(), paidAmount: 500 });
      prisma.loanPayment.count.mockResolvedValue(3);

      await service.recordPayment(COMPANY_A, { name: "Owner" }, "p1", { paidAmount: 500 });

      expect(prisma.loan.update).not.toHaveBeenCalled();
    });

    it("rejects a payment id that doesn't exist for the company", async () => {
      prisma.loanPayment.findFirst.mockResolvedValue(null);

      await expect(service.recordPayment(COMPANY_A, { name: "Owner" }, "missing", { paidAmount: 500 })).rejects.toThrow(NotFoundException);
    });
  });
});
