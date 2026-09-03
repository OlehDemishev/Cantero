import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateSuretyBondInput, UpdateSuretyBondCapacityLimitInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

@Injectable()
export class SuretyBondsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(companyId: string, projectId?: string) {
    return this.prisma.suretyBond.findMany({
      where: { companyId, projectId },
      include: { project: { select: { id: true, name: true } } },
      orderBy: { issueDate: "desc" },
    });
  }

  async create(companyId: string, actor: AuditActor, input: CreateSuretyBondInput) {
    if (input.projectId) {
      const project = await this.prisma.project.findFirst({ where: { id: input.projectId, companyId } });
      if (!project) throw new NotFoundException("Project not found");
    }

    const bond = await this.prisma.suretyBond.create({
      data: {
        companyId,
        projectId: input.projectId,
        type: input.type,
        bondNumber: input.bondNumber,
        suretyName: input.suretyName,
        agentContact: input.agentContact,
        penalSum: input.penalSum,
        premium: input.premium,
        issueDate: new Date(input.issueDate),
        expiryDate: input.expiryDate ? new Date(input.expiryDate) : undefined,
        notes: input.notes,
      },
      include: { project: { select: { id: true, name: true } } },
    });
    this.audit.record(companyId, actor, "surety_bond.created", "SuretyBond", bond.id, `Added ${input.type} bond from ${input.suretyName}`);
    return bond;
  }

  async release(companyId: string, actor: AuditActor, id: string) {
    const bond = await this.prisma.suretyBond.findFirst({ where: { id, companyId } });
    if (!bond) throw new NotFoundException("Surety bond not found");
    if (bond.status !== "active") throw new BadRequestException("Only an active bond can be released");
    const updated = await this.prisma.suretyBond.update({
      where: { id },
      data: { status: "released" },
      include: { project: { select: { id: true, name: true } } },
    });
    this.audit.record(companyId, actor, "surety_bond.released", "SuretyBond", id, `Released bond from ${bond.suretyName}`);
    return updated;
  }

  /** Sum of active bonds' penalSum against Company.bondingCapacityLimit — the headroom figure a
   * GC checks before bidding new work. Null limit means "not set" rather than "zero capacity". */
  async capacityUtilization(companyId: string) {
    const [company, activeBonds] = await Promise.all([
      this.prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { bondingCapacityLimit: true } }),
      this.prisma.suretyBond.findMany({ where: { companyId, status: "active" }, select: { penalSum: true } }),
    ]);
    const used = round2(activeBonds.reduce((sum, b) => sum + Number(b.penalSum), 0));
    const limit = company.bondingCapacityLimit !== null ? Number(company.bondingCapacityLimit) : null;
    return {
      limit,
      used,
      available: limit !== null ? round2(limit - used) : null,
      utilizationPercent: limit !== null && limit > 0 ? round2((used / limit) * 100) : null,
    };
  }

  async updateCapacityLimit(companyId: string, actor: AuditActor, input: UpdateSuretyBondCapacityLimitInput) {
    await this.prisma.company.update({ where: { id: companyId }, data: { bondingCapacityLimit: input.bondingCapacityLimit } });
    this.audit.record(companyId, actor, "company.bonding_capacity_limit_updated", "Company", companyId, "Updated bonding capacity limit");
    return this.capacityUtilization(companyId);
  }
}
