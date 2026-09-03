import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateLoanInput, RecordLoanPaymentInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { calculateAmortizationSchedule } from "./loan-amortization";

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

@Injectable()
export class LoansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(companyId: string) {
    return this.prisma.loan.findMany({
      where: { companyId },
      include: { equipment: { select: { id: true, name: true } } },
      orderBy: { startDate: "desc" },
    });
  }

  async get(companyId: string, id: string) {
    const loan = await this.findOrThrow(companyId, id);
    const payments = await this.prisma.loanPayment.findMany({ where: { loanId: id }, orderBy: { dueDate: "asc" } });
    return { ...loan, payments };
  }

  async create(companyId: string, actor: AuditActor, input: CreateLoanInput) {
    if (input.equipmentId) {
      const equipment = await this.prisma.equipment.findFirst({ where: { id: input.equipmentId, companyId } });
      if (!equipment) throw new BadRequestException("Equipment not found");
    }

    const schedule = calculateAmortizationSchedule({
      principal: input.principal,
      annualInterestRatePercent: input.interestRatePercent,
      termMonths: input.termMonths,
      startDate: new Date(input.startDate),
    });

    const loan = await this.prisma.loan.create({
      data: {
        companyId,
        equipmentId: input.equipmentId,
        lenderName: input.lenderName,
        principal: input.principal,
        interestRatePercent: input.interestRatePercent,
        termMonths: input.termMonths,
        startDate: new Date(input.startDate),
        notes: input.notes,
        payments: {
          create: schedule.map((row) => ({
            companyId,
            dueDate: row.dueDate,
            principalPortion: row.principalPortion,
            interestPortion: row.interestPortion,
          })),
        },
      },
      include: { equipment: { select: { id: true, name: true } }, payments: true },
    });
    this.audit.record(companyId, actor, "loan.created", "Loan", loan.id, `Added loan from ${input.lenderName} for ${input.principal}`);
    return loan;
  }

  async recordPayment(companyId: string, actor: AuditActor, paymentId: string, input: RecordLoanPaymentInput) {
    const payment = await this.prisma.loanPayment.findFirst({ where: { id: paymentId, companyId } });
    if (!payment) throw new NotFoundException("Loan payment not found");
    if (payment.paidAt) throw new BadRequestException("This payment has already been recorded");

    const updated = await this.prisma.loanPayment.update({
      where: { id: paymentId },
      data: { paidAt: new Date(), paidAmount: input.paidAmount },
    });

    const remaining = await this.prisma.loanPayment.count({ where: { loanId: payment.loanId, paidAt: null } });
    if (remaining === 0) {
      await this.prisma.loan.update({ where: { id: payment.loanId }, data: { status: "paid_off" } });
    }

    this.audit.record(companyId, actor, "loan_payment.recorded", "LoanPayment", paymentId, `Recorded a payment of ${input.paidAmount}`);
    return updated;
  }

  /** Outstanding principal across active loans, plus scheduled debt service (principal +
   * interest) due in the next `monthsAhead` months — a plain summary a finance dashboard can
   * fold in, not itself a cash-flow forecast. */
  async debtServiceSummary(companyId: string, monthsAhead = 3) {
    const [activeLoans, upcomingPayments] = await Promise.all([
      this.prisma.loan.findMany({ where: { companyId, status: "active" }, include: { payments: { where: { paidAt: null } } } }),
      this.prisma.loanPayment.findMany({
        where: {
          companyId,
          paidAt: null,
          dueDate: { lte: new Date(Date.now() + monthsAhead * 30 * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    const outstandingPrincipal = round2(
      activeLoans.reduce((sum, loan) => sum + loan.payments.reduce((s, p) => s + Number(p.principalPortion), 0), 0),
    );
    const upcomingDebtService = round2(upcomingPayments.reduce((sum, p) => sum + Number(p.principalPortion) + Number(p.interestPortion), 0));

    return { activeLoanCount: activeLoans.length, outstandingPrincipal, upcomingDebtService, monthsAhead };
  }

  private async findOrThrow(companyId: string, id: string) {
    const loan = await this.prisma.loan.findFirst({ where: { id, companyId }, include: { equipment: { select: { id: true, name: true } } } });
    if (!loan) throw new NotFoundException("Loan not found");
    return loan;
  }
}
