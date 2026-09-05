import { Injectable, NotFoundException } from "@nestjs/common";
import type { LogProductivityInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { calculateProductivityRate } from "./productivity-rate";

@Injectable()
export class ProductivityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listForProject(companyId: string, projectId: string) {
    return this.prisma.productivityLog.findMany({
      where: { companyId, projectId },
      include: { costCode: true },
      orderBy: { workDate: "desc" },
    });
  }

  async log(companyId: string, actor: AuditActor, projectId: string, input: LogProductivityInput) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");

    if (input.costCodeId) {
      const costCode = await this.prisma.costCode.findFirst({ where: { id: input.costCodeId, companyId } });
      if (!costCode) throw new NotFoundException("Cost code not found");
    }

    const log = await this.prisma.productivityLog.create({
      data: {
        companyId,
        projectId,
        costCodeId: input.costCodeId,
        workDate: input.workDate,
        quantityCompleted: input.quantityCompleted,
        unit: input.unit,
        laborHours: input.laborHours,
        crewName: input.crewName,
        notes: input.notes,
      },
      include: { costCode: true },
    });

    this.audit.record(
      companyId,
      actor,
      "productivity_log.created",
      "ProductivityLog",
      log.id,
      `Logged ${input.quantityCompleted} ${input.unit} in ${input.laborHours}h`,
    );
    return log;
  }

  /** Benchmarks a cost code's productivity rate across a project, or across the whole company when projectId is omitted. */
  async rateByCostCode(companyId: string, costCodeId: string, projectId?: string) {
    const costCode = await this.prisma.costCode.findFirst({ where: { id: costCodeId, companyId } });
    if (!costCode) throw new NotFoundException("Cost code not found");

    const logs = await this.prisma.productivityLog.findMany({
      where: { companyId, costCodeId, ...(projectId ? { projectId } : {}) },
    });

    return calculateProductivityRate(logs.map((l) => ({ quantityCompleted: Number(l.quantityCompleted), laborHours: Number(l.laborHours) })));
  }

  /** Company-wide productivity by crew, across every project — the ops-leadership view of total
   * hours and output per crew, as opposed to rateByCostCode()'s single-cost-code lens. Grouped
   * further by unit within each crew, since "units/hour" only benchmarks meaningfully when the
   * units match (a framing crew's sf/hr isn't comparable to a concrete crew's cy/hr) — mixing
   * units into one rate per crew would produce a number nobody could act on. Logs with no
   * crewName are grouped under a null bucket rather than dropped, so untracked work still shows
   * up in the company total. */
  async crewScorecard(companyId: string) {
    const logs = await this.prisma.productivityLog.findMany({
      where: { companyId },
      select: { crewName: true, projectId: true, unit: true, quantityCompleted: true, laborHours: true },
      orderBy: { crewName: "asc" },
    });

    const byCrew = new Map<string | null, typeof logs>();
    for (const log of logs) {
      byCrew.set(log.crewName, [...(byCrew.get(log.crewName) ?? []), log]);
    }

    return Array.from(byCrew.entries()).map(([crewName, group]) => {
      const byUnit = new Map<string, typeof group>();
      for (const log of group) byUnit.set(log.unit, [...(byUnit.get(log.unit) ?? []), log]);

      return {
        crewName,
        projectCount: new Set(group.map((l) => l.projectId)).size,
        totalLaborHours: group.reduce((sum, l) => sum + Number(l.laborHours), 0),
        byUnit: Array.from(byUnit.entries()).map(([unit, unitGroup]) => ({
          unit,
          ...calculateProductivityRate(unitGroup.map((l) => ({ quantityCompleted: Number(l.quantityCompleted), laborHours: Number(l.laborHours) }))),
        })),
      };
    });
  }
}
