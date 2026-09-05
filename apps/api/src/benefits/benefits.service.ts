import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  CreateBenefitPlanInput,
  CreateBenefitPlanTierInput,
  EnrollWorkerInBenefitInput,
  UpdateBenefitPlanInput,
  UpdateEnrollmentStatusInput,
} from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

@Injectable()
export class BenefitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listPlans(companyId: string) {
    return this.prisma.benefitPlan.findMany({
      where: { companyId },
      include: { tiers: true, _count: { select: { enrollments: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async createPlan(companyId: string, actor: AuditActor, input: CreateBenefitPlanInput) {
    const plan = await this.prisma.benefitPlan.create({ data: { companyId, name: input.name, type: input.type, carrier: input.carrier } });
    this.audit.record(companyId, actor, "benefit_plan.created", "BenefitPlan", plan.id, `Added benefit plan "${input.name}"`);
    return plan;
  }

  async updatePlan(companyId: string, actor: AuditActor, id: string, input: UpdateBenefitPlanInput) {
    const existing = await this.findPlanOrThrow(companyId, id);
    const updated = await this.prisma.benefitPlan.update({ where: { id }, data: { name: input.name, carrier: input.carrier, active: input.active } });
    this.audit.record(companyId, actor, "benefit_plan.updated", "BenefitPlan", id, `Updated benefit plan "${existing.name}"`);
    return updated;
  }

  async addTier(companyId: string, actor: AuditActor, planId: string, input: CreateBenefitPlanTierInput) {
    const plan = await this.findPlanOrThrow(companyId, planId);
    const tier = await this.prisma.benefitPlanTier.create({
      data: {
        companyId,
        planId,
        name: input.name,
        monthlyEmployerCost: input.monthlyEmployerCost,
        monthlyEmployeeCost: input.monthlyEmployeeCost,
      },
    });
    this.audit.record(companyId, actor, "benefit_plan_tier.added", "BenefitPlanTier", tier.id, `Added tier "${input.name}" to "${plan.name}"`);
    return tier;
  }

  listEnrollmentsForWorker(companyId: string, workerId: string) {
    return this.prisma.benefitEnrollment.findMany({
      where: { companyId, workerId },
      include: { plan: true, tier: true, dependents: true },
      orderBy: { effectiveDate: "desc" },
    });
  }

  async enrollWorker(companyId: string, actor: AuditActor, workerId: string, planId: string, input: EnrollWorkerInBenefitInput) {
    const worker = await this.prisma.worker.findFirst({ where: { id: workerId, companyId } });
    if (!worker) throw new NotFoundException("Worker not found");
    const tier = await this.prisma.benefitPlanTier.findFirst({ where: { id: input.tierId, companyId, planId } });
    if (!tier) throw new BadRequestException("Tier does not belong to this plan");

    const enrollment = await this.prisma.benefitEnrollment.create({
      data: {
        companyId,
        workerId,
        planId,
        tierId: input.tierId,
        effectiveDate: new Date(input.effectiveDate),
        dependents: input.dependents
          ? { create: input.dependents.map((d) => ({ companyId, name: d.name, relationship: d.relationship, birthDate: d.birthDate ? new Date(d.birthDate) : undefined })) }
          : undefined,
      },
      include: { plan: true, tier: true, dependents: true },
    });
    this.audit.record(companyId, actor, "benefit_enrollment.created", "BenefitEnrollment", enrollment.id, `Enrolled ${worker.name} in "${tier.name}"`);
    return enrollment;
  }

  async updateEnrollmentStatus(companyId: string, actor: AuditActor, id: string, input: UpdateEnrollmentStatusInput) {
    const enrollment = await this.prisma.benefitEnrollment.findFirst({ where: { id, companyId } });
    if (!enrollment) throw new NotFoundException("Enrollment not found");
    const updated = await this.prisma.benefitEnrollment.update({
      where: { id },
      data: { status: input.status, endDate: input.status === "terminated" ? new Date() : undefined },
    });
    this.audit.record(companyId, actor, "benefit_enrollment.status_changed", "BenefitEnrollment", id, `Changed enrollment status to ${input.status}`);
    return updated;
  }

  /** Total monthly employer/employee cost across every active enrollment — the figure finance
   * needs to reconcile against the benefits invoice from the carrier. */
  async costSummary(companyId: string) {
    const enrollments = await this.prisma.benefitEnrollment.findMany({
      where: { companyId, status: "active" },
      include: { tier: true, plan: { select: { type: true } } },
    });
    const totalMonthlyEmployerCost = round2(enrollments.reduce((sum, e) => sum + Number(e.tier.monthlyEmployerCost), 0));
    const totalMonthlyEmployeeCost = round2(enrollments.reduce((sum, e) => sum + Number(e.tier.monthlyEmployeeCost), 0));
    return { activeEnrollmentCount: enrollments.length, totalMonthlyEmployerCost, totalMonthlyEmployeeCost };
  }

  /** One row per worker with an active enrollment, per plan — the monthly payroll deduction
   * amount, in the same generic "hand this to payroll" spirit as LaborCostService's ADP/Gusto
   * hours exports. */
  async payrollDeductionExport(companyId: string) {
    const enrollments = await this.prisma.benefitEnrollment.findMany({
      where: { companyId, status: "active" },
      include: { worker: { select: { name: true, payrollEmployeeId: true } }, plan: { select: { name: true } }, tier: true },
    });
    return enrollments.map((e) => ({
      workerName: e.worker.name,
      payrollEmployeeId: e.worker.payrollEmployeeId,
      planName: e.plan.name,
      tierName: e.tier.name,
      monthlyEmployeeDeduction: Number(e.tier.monthlyEmployeeCost),
    }));
  }

  private async findPlanOrThrow(companyId: string, id: string) {
    const plan = await this.prisma.benefitPlan.findFirst({ where: { id, companyId } });
    if (!plan) throw new NotFoundException("Benefit plan not found");
    return plan;
  }
}
