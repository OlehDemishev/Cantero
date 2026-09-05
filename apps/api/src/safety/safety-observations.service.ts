import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreateSafetyObservationInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { calculateSafeObservationRate } from "./safe-observation-rate";

@Injectable()
export class SafetyObservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listForProject(companyId: string, projectId: string) {
    return this.prisma.safetyObservation.findMany({
      where: { companyId, projectId },
      orderBy: { observedAt: "desc" },
    });
  }

  async create(companyId: string, actor: AuditActor, input: CreateSafetyObservationInput) {
    const project = await this.prisma.project.findFirst({ where: { id: input.projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");

    const observation = await this.prisma.safetyObservation.create({
      data: {
        companyId,
        projectId: input.projectId,
        category: input.category,
        behaviorObserved: input.behaviorObserved,
        correctiveAction: input.correctiveAction,
        observerUserId: actor.userId,
        observerName: actor.name,
      },
    });

    this.audit.record(
      companyId,
      actor,
      "safety_observation.logged",
      "SafetyObservation",
      observation.id,
      `Logged a ${input.category === "safe" ? "safe" : "at-risk"} observation on "${project.name}"`,
    );
    return observation;
  }

  /** Company-wide rate for the given year, plus a monthly trend — mirrors safety-analytics.service.ts's shape. */
  async rateByYear(companyId: string, year: number) {
    const observations = await this.prisma.safetyObservation.findMany({
      where: { companyId, observedAt: { gte: new Date(`${year}-01-01`), lt: new Date(`${year + 1}-01-01`) } },
      select: { category: true, observedAt: true },
    });

    const overall = calculateSafeObservationRate(observations);

    const byMonthMap = new Map<string, { category: "safe" | "at_risk" }[]>();
    for (const o of observations) {
      const key = `${o.observedAt.getUTCFullYear()}-${String(o.observedAt.getUTCMonth() + 1).padStart(2, "0")}`;
      byMonthMap.set(key, [...(byMonthMap.get(key) ?? []), { category: o.category }]);
    }
    const monthlyTrend = Array.from(byMonthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, group]) => ({ month, ...calculateSafeObservationRate(group) }));

    return { year, ...overall, monthlyTrend };
  }
}
