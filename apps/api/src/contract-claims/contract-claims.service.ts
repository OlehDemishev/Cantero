import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  AddContractClaimEventInput,
  CreateContractClaimInput,
  ResolveContractClaimInput,
  UpdateContractClaimStatusInput,
} from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";

@Injectable()
export class ContractClaimsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listForProject(companyId: string, projectId: string) {
    return this.prisma.contractClaim.findMany({
      where: { companyId, projectId },
      orderBy: { noticeDate: "desc" },
    });
  }

  async get(companyId: string, id: string) {
    const claim = await this.findOrThrow(companyId, id);
    const events = await this.prisma.contractClaimEvent.findMany({ where: { claimId: id }, orderBy: { occurredAt: "asc" } });
    return { ...claim, events };
  }

  async create(companyId: string, actor: AuditActor, projectId: string, input: CreateContractClaimInput) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");

    const claim = await this.prisma.contractClaim.create({
      data: {
        companyId,
        projectId,
        type: input.type,
        title: input.title,
        description: input.description,
        noticeDate: new Date(input.noticeDate),
        requestedAmount: input.requestedAmount,
        requestedDays: input.requestedDays,
      },
    });
    await this.prisma.contractClaimEvent.create({
      data: { companyId, claimId: claim.id, description: `Notice of claim served: "${input.title}"`, createdByName: actor.name },
    });
    this.audit.record(companyId, actor, "contract_claim.created", "ContractClaim", claim.id, `Filed notice of claim "${input.title}" on "${project.name}"`);
    return claim;
  }

  async updateStatus(companyId: string, actor: AuditActor, id: string, input: UpdateContractClaimStatusInput) {
    const claim = await this.findOrThrow(companyId, id);
    if (claim.status === "resolved" || claim.status === "rejected") {
      throw new BadRequestException("This claim is already closed");
    }
    const updated = await this.prisma.contractClaim.update({ where: { id }, data: { status: input.status } });
    await this.prisma.contractClaimEvent.create({
      data: { companyId, claimId: id, description: `Status changed to "${input.status}"`, createdByName: actor.name },
    });
    this.audit.record(companyId, actor, "contract_claim.status_changed", "ContractClaim", id, `Changed status of claim "${claim.title}" to ${input.status}`);
    return updated;
  }

  async resolve(companyId: string, actor: AuditActor, id: string, input: ResolveContractClaimInput) {
    const claim = await this.findOrThrow(companyId, id);
    if (claim.status === "resolved" || claim.status === "rejected") {
      throw new BadRequestException("This claim is already closed");
    }
    const updated = await this.prisma.contractClaim.update({
      where: { id },
      data: { status: "resolved", resolution: input.resolution, resolvedAt: new Date() },
    });
    await this.prisma.contractClaimEvent.create({
      data: { companyId, claimId: id, description: `Resolved: ${input.resolution}`, createdByName: actor.name },
    });
    this.audit.record(companyId, actor, "contract_claim.resolved", "ContractClaim", id, `Resolved claim "${claim.title}"`);
    return updated;
  }

  async addEvent(companyId: string, actor: AuditActor, id: string, input: AddContractClaimEventInput) {
    await this.findOrThrow(companyId, id);
    return this.prisma.contractClaimEvent.create({
      data: {
        companyId,
        claimId: id,
        description: input.description,
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : undefined,
        createdByName: actor.name,
      },
    });
  }

  private async findOrThrow(companyId: string, id: string) {
    const claim = await this.prisma.contractClaim.findFirst({ where: { id, companyId } });
    if (!claim) throw new NotFoundException("Contract claim not found");
    return claim;
  }
}
