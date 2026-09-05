import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { AddBidScoreCriterionInput, CreateBidRequestInput, ScoreBidInput, SubmitBidInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { SubcontractorsService } from "../finance/subcontractors.service";
import type { PortalSubcontractorContext } from "../subcontractor-portal/subcontractor-portal-jwt.service";
import { weightedBidScore } from "./bid-scoring";
import { calculateBidLeveling } from "./bid-leveling";

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
        bids: {
          include: { subcontractor: { select: { id: true, name: true } }, scores: true, lines: { orderBy: { sortOrder: "asc" } } },
          orderBy: { amount: "asc" },
        },
        criteria: true,
      },
    });
    if (!bidRequest) throw new NotFoundException("Bid request not found");

    const criteriaWeights = bidRequest.criteria.map((c) => ({ criterionId: c.id, weight: c.weight }));
    return {
      ...bidRequest,
      bids: bidRequest.bids.map((bid) => ({
        ...bid,
        weightedScore: weightedBidScore(
          bid.scores.map((s) => ({ criterionId: s.criterionId, score: s.score })),
          criteriaWeights,
        ),
      })),
    };
  }

  async addCriterion(companyId: string, actor: AuditActor, bidRequestId: string, input: AddBidScoreCriterionInput) {
    const bidRequest = await this.prisma.bidRequest.findFirst({ where: { id: bidRequestId, companyId } });
    if (!bidRequest) throw new NotFoundException("Bid request not found");

    const criterion = await this.prisma.bidScoreCriterion.create({
      data: { bidRequestId, label: input.label, weight: input.weight },
    });
    this.audit.record(
      companyId,
      actor,
      "bid_request.criterion_added",
      "BidRequest",
      bidRequestId,
      `Added scoring criterion "${input.label}" (weight ${input.weight}) to "${bidRequest.title}"`,
    );
    return criterion;
  }

  async removeCriterion(companyId: string, actor: AuditActor, bidRequestId: string, criterionId: string) {
    const criterion = await this.prisma.bidScoreCriterion.findFirst({
      where: { id: criterionId, bidRequestId, bidRequest: { companyId } },
    });
    if (!criterion) throw new NotFoundException("Criterion not found");

    await this.prisma.bidScoreCriterion.delete({ where: { id: criterionId } });
    this.audit.record(companyId, actor, "bid_request.criterion_removed", "BidRequest", bidRequestId, `Removed scoring criterion "${criterion.label}"`);
    return { ok: true };
  }

  async scoreBid(companyId: string, actor: AuditActor, bidRequestId: string, bidId: string, input: ScoreBidInput) {
    const bid = await this.prisma.bid.findFirst({ where: { id: bidId, bidRequestId, bidRequest: { companyId } } });
    if (!bid) throw new NotFoundException("Bid not found");
    const criterion = await this.prisma.bidScoreCriterion.findFirst({ where: { id: input.criterionId, bidRequestId } });
    if (!criterion) throw new NotFoundException("Criterion not found");

    const score = await this.prisma.bidScore.upsert({
      where: { bidId_criterionId: { bidId, criterionId: input.criterionId } },
      create: { bidId, criterionId: input.criterionId, score: input.score },
      update: { score: input.score },
    });
    this.audit.record(
      companyId,
      actor,
      "bid_request.bid_scored",
      "BidRequest",
      bidRequestId,
      `Scored a bid ${input.score}/5 on "${criterion.label}"`,
    );
    return score;
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

    const bid = await this.prisma.bid.upsert({
      where: { bidRequestId_subcontractorId: { bidRequestId, subcontractorId: subcontractor.subcontractorId } },
      create: { bidRequestId, subcontractorId: subcontractor.subcontractorId, amount: input.amount, notes: input.notes },
      update: { amount: input.amount, notes: input.notes, submittedAt: new Date() },
    });

    // Lines are replaced wholesale on every (re-)submission — a sub revising their bid is
    // expected to resend their full scope breakdown, not patch individual lines.
    if (input.lines) {
      await this.prisma.bidLine.deleteMany({ where: { bidId: bid.id } });
      if (input.lines.length > 0) {
        await this.prisma.bidLine.createMany({
          data: input.lines.map((line, i) => ({
            bidId: bid.id,
            description: line.description,
            amount: line.amount,
            included: line.included,
            sortOrder: i,
          })),
        });
      }
    }

    return this.prisma.bid.findUniqueOrThrow({ where: { id: bid.id }, include: { lines: { orderBy: { sortOrder: "asc" } } } });
  }

  /** Side-by-side scope comparison across every bid on this request — see bid-leveling.ts. */
  async leveling(companyId: string, bidRequestId: string) {
    const bidRequest = await this.prisma.bidRequest.findFirst({
      where: { id: bidRequestId, companyId },
      include: {
        bids: { include: { subcontractor: { select: { id: true, name: true } }, lines: { orderBy: { sortOrder: "asc" } } } },
      },
    });
    if (!bidRequest) throw new NotFoundException("Bid request not found");

    const scopeItems = calculateBidLeveling(
      bidRequest.bids.map((bid) => ({
        bidId: bid.id,
        lines: bid.lines.map((l) => ({ description: l.description, amount: Number(l.amount), included: l.included })),
      })),
    );

    return {
      bids: bidRequest.bids.map((bid) => ({
        id: bid.id,
        subcontractorId: bid.subcontractor.id,
        subcontractorName: bid.subcontractor.name,
        amount: Number(bid.amount),
      })),
      scopeItems,
    };
  }
}
