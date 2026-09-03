import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { AddHrCaseActionInput, OpenHrCaseInput, UpdateHrCaseStatusInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";

@Injectable()
export class HrCasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(companyId: string) {
    return this.prisma.hrCase.findMany({
      where: { companyId },
      include: { worker: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  listForWorker(companyId: string, workerId: string) {
    return this.prisma.hrCase.findMany({ where: { companyId, workerId }, orderBy: { createdAt: "desc" } });
  }

  async get(companyId: string, id: string) {
    const hrCase = await this.findOrThrow(companyId, id);
    const actions = await this.prisma.hrCaseAction.findMany({ where: { caseId: id }, orderBy: { actionDate: "asc" } });
    return { ...hrCase, actions };
  }

  async openCase(companyId: string, actor: AuditActor, workerId: string, input: OpenHrCaseInput) {
    const worker = await this.prisma.worker.findFirst({ where: { id: workerId, companyId } });
    if (!worker) throw new NotFoundException("Worker not found");

    const hrCase = await this.prisma.hrCase.create({
      data: {
        companyId,
        workerId,
        reporterName: actor.name,
        category: input.category,
        severity: input.severity,
        description: input.description,
        confidential: input.confidential,
      },
    });
    this.audit.record(companyId, actor, "hr_case.opened", "HrCase", hrCase.id, `Opened an HR case for ${worker.name}`);
    return hrCase;
  }

  async updateStatus(companyId: string, actor: AuditActor, id: string, input: UpdateHrCaseStatusInput) {
    const hrCase = await this.findOrThrow(companyId, id);
    if (hrCase.status === "closed") throw new BadRequestException("This case is already closed");
    const updated = await this.prisma.hrCase.update({
      where: { id },
      data: { status: input.status, closedAt: input.status === "closed" ? new Date() : undefined },
    });
    this.audit.record(companyId, actor, "hr_case.status_changed", "HrCase", id, `Changed HR case status to ${input.status}`);
    return updated;
  }

  async addAction(companyId: string, actor: AuditActor, id: string, input: AddHrCaseActionInput) {
    await this.findOrThrow(companyId, id);
    const action = await this.prisma.hrCaseAction.create({
      data: {
        companyId,
        caseId: id,
        type: input.type,
        description: input.description,
        actionDate: input.actionDate ? new Date(input.actionDate) : undefined,
        createdByName: actor.name,
      },
    });
    this.audit.record(companyId, actor, "hr_case_action.logged", "HrCaseAction", action.id, `Logged a ${input.type} action`);
    return action;
  }

  async acknowledgeAction(companyId: string, actor: AuditActor, actionId: string) {
    const action = await this.prisma.hrCaseAction.findFirst({ where: { id: actionId, companyId } });
    if (!action) throw new NotFoundException("Action not found");
    if (action.acknowledgedAt) throw new BadRequestException("This action has already been acknowledged");
    const updated = await this.prisma.hrCaseAction.update({ where: { id: actionId }, data: { acknowledgedAt: new Date() } });
    this.audit.record(companyId, actor, "hr_case_action.acknowledged", "HrCaseAction", actionId, "Acknowledged an HR case action");
    return updated;
  }

  private async findOrThrow(companyId: string, id: string) {
    const hrCase = await this.prisma.hrCase.findFirst({ where: { id, companyId } });
    if (!hrCase) throw new NotFoundException("HR case not found");
    return hrCase;
  }
}
