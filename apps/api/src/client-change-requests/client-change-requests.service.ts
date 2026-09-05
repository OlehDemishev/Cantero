import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { ConvertClientChangeRequestInput, DeclineClientChangeRequestInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";

const INCLUDE = {
  submittedByClient: { select: { id: true, name: true } },
  convertedChangeOrder: { select: { id: true, number: true } },
} as const;

@Injectable()
export class ClientChangeRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listForProject(companyId: string, projectId: string) {
    return this.prisma.clientChangeRequest.findMany({
      where: { companyId, projectId },
      include: INCLUDE,
      orderBy: { createdAt: "desc" },
    });
  }

  async startReview(companyId: string, actor: AuditActor, id: string) {
    const request = await this.findOrThrow(companyId, id);
    if (request.status !== "submitted") throw new BadRequestException("Only a newly submitted request can be moved to review");

    const updated = await this.prisma.clientChangeRequest.update({ where: { id }, data: { status: "under_review" }, include: INCLUDE });
    this.audit.record(companyId, actor, "client_change_request.under_review", "ClientChangeRequest", id, `Started review of "${request.title}"`);
    return updated;
  }

  async convert(companyId: string, actor: AuditActor, id: string, input: ConvertClientChangeRequestInput) {
    const request = await this.findOrThrow(companyId, id);
    if (request.status === "converted" || request.status === "declined") {
      throw new BadRequestException("This request has already been resolved");
    }

    const changeOrder = await this.prisma.changeOrder.findFirst({
      where: { id: input.changeOrderId, companyId, estimate: { projectId: request.projectId } },
    });
    if (!changeOrder) throw new NotFoundException("Change order not found on this project");

    const updated = await this.prisma.clientChangeRequest.update({
      where: { id },
      data: { status: "converted", convertedChangeOrderId: changeOrder.id, reviewedByName: actor.name, reviewedAt: new Date() },
      include: INCLUDE,
    });
    this.audit.record(
      companyId,
      actor,
      "client_change_request.converted",
      "ClientChangeRequest",
      id,
      `Converted "${request.title}" into CO-${changeOrder.number}`,
    );
    return updated;
  }

  async decline(companyId: string, actor: AuditActor, id: string, input: DeclineClientChangeRequestInput) {
    const request = await this.findOrThrow(companyId, id);
    if (request.status === "converted" || request.status === "declined") {
      throw new BadRequestException("This request has already been resolved");
    }

    const updated = await this.prisma.clientChangeRequest.update({
      where: { id },
      data: { status: "declined", reviewNote: input.reviewNote, reviewedByName: actor.name, reviewedAt: new Date() },
      include: INCLUDE,
    });
    this.audit.record(companyId, actor, "client_change_request.declined", "ClientChangeRequest", id, `Declined "${request.title}"`);
    return updated;
  }

  private async findOrThrow(companyId: string, id: string) {
    const request = await this.prisma.clientChangeRequest.findFirst({ where: { id, companyId } });
    if (!request) throw new NotFoundException("Client change request not found");
    return request;
  }
}
