import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateBidRequestInput, SubmitBidInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { SubcontractorsService } from "../finance/subcontractors.service";
import type { PortalSubcontractorContext } from "../subcontractor-portal/subcontractor-portal-jwt.service";

@Injectable()
export class BidRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly subcontractors: SubcontractorsService,
  ) {}

  list(companyId: string, projectId?: string) {
    return this.prisma.bidRequest.findMany({
      where: { companyId, ...(projectId ? { projectId } : {}) },
      include: {
        project: { select: { name: true } },
        invites: { include: { subcontractor: { select: { id: true, name: true } } } },
        bids: { include: { subcontractor: { select: { id: true, name: true } } }, orderBy: { amount: "asc" } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async get(companyId: string, id: string) {
    const bidRequest = await this.prisma.bidRequest.findFirst({
      where: { id, companyId },
      include: {
        project: { select: { name: true } },
        invites: { include: { subcontractor: { select: { id: true, name: true } } } },
        bids: { include: { subcontractor: { select: { id: true, name: true } } }, orderBy: { amount: "asc" } },
      },
    });
    if (!bidRequest) throw new NotFoundException("Bid request not found");
    return bidRequest;
  }

  async create(companyId: string, actor: AuditActor, input: CreateBidRequestInput) {
    const project = await this.prisma.project.findFirst({ where: { id: input.projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");

    const subcontractors = await this.prisma.subcontractor.findMany({
      where: { id: { in: input.subcontractorIds }, companyId },
    });
    if (subcontractors.length !== input.subcontractorIds.length) {
      throw new BadRequestException("One or more subcontractors not found");
    }

    const bidRequest = await this.prisma.bidRequest.create({
      data: {
        companyId,
        projectId: input.projectId,
        title: input.title,
        description: input.description,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        invites: { create: input.subcontractorIds.map((subcontractorId) => ({ subcontractorId })) },
      },
      include: { invites: { include: { subcontractor: { select: { id: true, name: true } } } } },
    });
    this.audit.record(
      companyId,
      actor,
      "bid_request.created",
      "BidRequest",
      bidRequest.id,
      `Put "${input.title}" on ${project.name} out to bid with ${subcontractors.length} subcontractor(s)`,
    );
    return bidRequest;
  }

  /** Awards the given bid — creates the real SubcontractorAssignment (through SubcontractorsService, so the insurance-compliance gate still applies) and closes the request to further submissions. */
  async award(companyId: string, actor: AuditActor, bidRequestId: string, bidId: string) {
    const bidRequest = await this.prisma.bidRequest.findFirst({ where: { id: bidRequestId, companyId } });
    if (!bidRequest) throw new NotFoundException("Bid request not found");
    if (bidRequest.status !== "open") throw new BadRequestException("This bid request is no longer open");

    const bid = await this.prisma.bid.findFirst({
      where: { id: bidId, bidRequestId },
      include: { subcontractor: true },
    });
    if (!bid) throw new NotFoundException("Bid not found");

    await this.subcontractors.assign(companyId, bid.subcontractorId, bidRequest.projectId);

    await this.prisma.$transaction([
      this.prisma.bid.update({ where: { id: bid.id }, data: { isAwarded: true } }),
      this.prisma.bidRequest.update({ where: { id: bidRequestId }, data: { status: "awarded" } }),
    ]);

    this.audit.record(
      companyId,
      actor,
      "bid_request.awarded",
      "BidRequest",
      bidRequestId,
      `Awarded "${bidRequest.title}" to ${bid.subcontractor.name} for ${bid.amount}`,
    );
    return this.get(companyId, bidRequestId);
  }

  async cancel(companyId: string, actor: AuditActor, bidRequestId: string) {
    const bidRequest = await this.prisma.bidRequest.findFirst({ where: { id: bidRequestId, companyId } });
    if (!bidRequest) throw new NotFoundException("Bid request not found");
    if (bidRequest.status !== "open") throw new BadRequestException("This bid request is no longer open");

    await this.prisma.bidRequest.update({ where: { id: bidRequestId }, data: { status: "cancelled" } });
    this.audit.record(companyId, actor, "bid_request.cancelled", "BidRequest", bidRequestId, `Cancelled "${bidRequest.title}"`);
    return { ok: true };
  }

  // ---- Subcontractor-portal side ----

  listForSubcontractor(subcontractor: PortalSubcontractorContext) {
    return this.prisma.bidRequest.findMany({
      where: { invites: { some: { subcontractorId: subcontractor.subcontractorId } } },
      include: {
        project: { select: { name: true } },
        bids: { where: { subcontractorId: subcontractor.subcontractorId } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async submitBid(subcontractor: PortalSubcontractorContext, bidRequestId: string, input: SubmitBidInput) {
    const invite = await this.prisma.bidInvite.findFirst({
      where: { bidRequestId, subcontractorId: subcontractor.subcontractorId },
      include: { bidRequest: true },
    });
    if (!invite) throw new NotFoundException("Bid request not found");
    if (invite.bidRequest.status !== "open") throw new BadRequestException("This bid request is no longer accepting bids");

    return this.prisma.bid.upsert({
      where: { bidRequestId_subcontractorId: { bidRequestId, subcontractorId: subcontractor.subcontractorId } },
      create: { bidRequestId, subcontractorId: subcontractor.subcontractorId, amount: input.amount, notes: input.notes },
      update: { amount: input.amount, notes: input.notes, submittedAt: new Date() },
    });
  }
}
