import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  CreatePerformanceGoalInput,
  CreatePerformanceReviewCycleInput,
  SubmitPerformanceReviewInput,
  UpdatePerformanceGoalProgressInput,
} from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";

@Injectable()
export class PerformanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listCycles(companyId: string) {
    return this.prisma.performanceReviewCycle.findMany({ where: { companyId }, orderBy: { periodStart: "desc" } });
  }

  async createCycle(companyId: string, actor: AuditActor, input: CreatePerformanceReviewCycleInput) {
    const cycle = await this.prisma.performanceReviewCycle.create({
      data: { companyId, name: input.name, periodStart: new Date(input.periodStart), periodEnd: new Date(input.periodEnd) },
    });
    this.audit.record(companyId, actor, "performance_cycle.created", "PerformanceReviewCycle", cycle.id, `Launched review cycle "${input.name}"`);
    return cycle;
  }

  async closeCycle(companyId: string, actor: AuditActor, id: string) {
    const cycle = await this.findCycleOrThrow(companyId, id);
    if (cycle.status === "closed") throw new BadRequestException("This cycle is already closed");
    const updated = await this.prisma.performanceReviewCycle.update({ where: { id }, data: { status: "closed" } });
    this.audit.record(companyId, actor, "performance_cycle.closed", "PerformanceReviewCycle", id, `Closed review cycle "${cycle.name}"`);
    return updated;
  }

  listReviewsForCycle(companyId: string, cycleId: string) {
    return this.prisma.performanceReview.findMany({
      where: { companyId, cycleId },
      include: { worker: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    });
  }

  listReviewsForWorker(companyId: string, workerId: string) {
    return this.prisma.performanceReview.findMany({
      where: { companyId, workerId },
      include: { cycle: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Upserts the one review per (cycle, worker) — a reviewer can save a draft (submit: false or
   * omitted) and come back to finalize it later; submittedAt is only ever set once. */
  async submitReview(companyId: string, actor: AuditActor, cycleId: string, input: SubmitPerformanceReviewInput) {
    const cycle = await this.findCycleOrThrow(companyId, cycleId);
    if (cycle.status === "closed") throw new BadRequestException("This review cycle is closed");
    const worker = await this.prisma.worker.findFirst({ where: { id: input.workerId, companyId } });
    if (!worker) throw new NotFoundException("Worker not found");

    const review = await this.prisma.performanceReview.upsert({
      where: { cycleId_workerId: { cycleId, workerId: input.workerId } },
      create: {
        companyId,
        cycleId,
        workerId: input.workerId,
        reviewerName: actor.name,
        rating: input.rating,
        strengths: input.strengths,
        improvementAreas: input.improvementAreas,
        submittedAt: input.submit ? new Date() : undefined,
      },
      update: {
        rating: input.rating,
        strengths: input.strengths,
        improvementAreas: input.improvementAreas,
        submittedAt: input.submit ? new Date() : undefined,
      },
    });
    this.audit.record(companyId, actor, "performance_review.submitted", "PerformanceReview", review.id, `Reviewed ${worker.name} for cycle "${cycle.name}"`);
    return review;
  }

  listGoalsForWorker(companyId: string, workerId: string) {
    return this.prisma.performanceGoal.findMany({ where: { companyId, workerId }, orderBy: { createdAt: "desc" } });
  }

  async createGoal(companyId: string, actor: AuditActor, workerId: string, input: CreatePerformanceGoalInput) {
    const worker = await this.prisma.worker.findFirst({ where: { id: workerId, companyId } });
    if (!worker) throw new NotFoundException("Worker not found");
    const goal = await this.prisma.performanceGoal.create({
      data: { companyId, workerId, title: input.title, targetDate: input.targetDate ? new Date(input.targetDate) : undefined },
    });
    this.audit.record(companyId, actor, "performance_goal.created", "PerformanceGoal", goal.id, `Set goal "${input.title}" for ${worker.name}`);
    return goal;
  }

  async updateGoalProgress(companyId: string, actor: AuditActor, id: string, input: UpdatePerformanceGoalProgressInput) {
    const goal = await this.prisma.performanceGoal.findFirst({ where: { id, companyId } });
    if (!goal) throw new NotFoundException("Goal not found");
    const updated = await this.prisma.performanceGoal.update({
      where: { id },
      data: { progressPercent: input.progressPercent, completedAt: input.progressPercent >= 100 ? new Date() : null },
    });
    this.audit.record(companyId, actor, "performance_goal.progress_updated", "PerformanceGoal", id, `Updated progress on "${goal.title}" to ${input.progressPercent}%`);
    return updated;
  }

  private async findCycleOrThrow(companyId: string, id: string) {
    const cycle = await this.prisma.performanceReviewCycle.findFirst({ where: { id, companyId } });
    if (!cycle) throw new NotFoundException("Review cycle not found");
    return cycle;
  }
}
