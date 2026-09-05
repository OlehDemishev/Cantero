import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { AddAllowanceChargeInput, CreateAllowanceInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { computeAllowanceStatus } from "./allowance-status";

@Injectable()
export class AllowancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listForProject(companyId: string, projectId: string) {
    return this.prisma.allowance.findMany({
      where: { companyId, projectId },
      include: { charges: { orderBy: { chargedAt: "desc" } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async create(companyId: string, actor: AuditActor, projectId: string, input: CreateAllowanceInput) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");

    const allowance = await this.prisma.allowance.create({
      data: { companyId, projectId, name: input.name, budgetedAmount: input.budgetedAmount, notes: input.notes },
    });
    this.audit.record(companyId, actor, "allowance.created", "Allowance", allowance.id, `Created allowance "${input.name}" (${input.budgetedAmount}) on "${project.name}"`);
    return allowance;
  }

  async addCharge(companyId: string, actor: AuditActor, allowanceId: string, input: AddAllowanceChargeInput) {
    const allowance = await this.findOrThrow(companyId, allowanceId);
    if (allowance.status === "closed") throw new BadRequestException("This allowance is closed and can't take new charges");

    await this.prisma.allowanceCharge.create({
      data: { allowanceId, description: input.description, amount: input.amount, createdByName: input.createdByName },
    });
    return this.recomputeStatus(companyId, actor, allowanceId);
  }

  async close(companyId: string, actor: AuditActor, id: string) {
    const allowance = await this.findOrThrow(companyId, id);
    const updated = await this.prisma.allowance.update({ where: { id }, data: { status: "closed" } });
    this.audit.record(companyId, actor, "allowance.closed", "Allowance", id, `Closed allowance "${allowance.name}"`);
    return updated;
  }

  private async recomputeStatus(companyId: string, actor: AuditActor, id: string) {
    const allowance = await this.prisma.allowance.findUniqueOrThrow({ where: { id }, include: { charges: true } });
    const spent = allowance.charges.reduce((sum, c) => sum + Number(c.amount), 0);
    const newStatus = computeAllowanceStatus(Number(allowance.budgetedAmount), spent, allowance.status);

    if (newStatus !== allowance.status) {
      await this.prisma.allowance.update({ where: { id }, data: { status: newStatus } });
      if (newStatus === "exceeded") {
        this.audit.record(companyId, actor, "allowance.exceeded", "Allowance", id, `Allowance "${allowance.name}" exceeded its budget (${spent} spent of ${allowance.budgetedAmount})`);
      }
    }
    return this.findOrThrow(companyId, id);
  }

  private async findOrThrow(companyId: string, id: string) {
    const allowance = await this.prisma.allowance.findFirst({ where: { id, companyId }, include: { charges: { orderBy: { chargedAt: "desc" } } } });
    if (!allowance) throw new NotFoundException("Allowance not found");
    return allowance;
  }
}
