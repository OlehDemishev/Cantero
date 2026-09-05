import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { BulkActionResult, CreateSubmittalInput, ReviewSubmittalInput, UpdateSubmittalInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { WebhooksService } from "../common/webhooks/webhooks.service";
import type { WebhookEvent } from "@cantero/shared";

const REVIEW_DECISION_WEBHOOK_EVENT: Record<string, WebhookEvent> = {
  approved: "submittal.approved",
  approved_as_noted: "submittal.approved",
  revise_and_resubmit: "submittal.revise_requested",
  rejected: "submittal.rejected",
};

@Injectable()
export class SubmittalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly webhooks: WebhooksService,
  ) {}

  /** Latest revision per chain, same convention as Document versioning. */
  async listForProject(companyId: string, projectId: string) {
    await this.assertProject(companyId, projectId);
    const all = await this.prisma.submittal.findMany({ where: { companyId, projectId }, orderBy: { createdAt: "asc" } });

    const latestByChain = new Map<string, (typeof all)[number]>();
    for (const s of all) {
      const chainKey = s.rootSubmittalId ?? s.id;
      const existing = latestByChain.get(chainKey);
      if (!existing || s.revision > existing.revision) latestByChain.set(chainKey, s);
    }
    return Array.from(latestByChain.values()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /** Every submittal pending review (latest revision per chain) across every project the company has — see RfiService.listOpenForCompany for the same cross-project pattern. */
  async listPendingForCompany(companyId: string) {
    const all = await this.prisma.submittal.findMany({
      where: { companyId },
      include: { project: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    });

    const latestByChain = new Map<string, (typeof all)[number]>();
    for (const s of all) {
      const chainKey = s.rootSubmittalId ?? s.id;
      const existing = latestByChain.get(chainKey);
      if (!existing || s.revision > existing.revision) latestByChain.set(chainKey, s);
    }
    return Array.from(latestByChain.values())
      .filter((s) => s.status === "submitted")
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async get(companyId: string, id: string) {
    const submittal = await this.findOrThrow(companyId, id);
    const chainRootId = submittal.rootSubmittalId ?? submittal.id;
    const history = await this.prisma.submittal.findMany({
      where: { companyId, OR: [{ id: chainRootId }, { rootSubmittalId: chainRootId }] },
      orderBy: { revision: "asc" },
    });
    return { ...submittal, history };
  }

  async create(companyId: string, actor: AuditActor, input: CreateSubmittalInput) {
    const project = await this.assertProject(companyId, input.projectId);

    const existingRootCount = await this.prisma.submittal.count({ where: { projectId: input.projectId, rootSubmittalId: null } });
    const number = `SUB-${String(existingRootCount + 1).padStart(3, "0")}`;

    const submittal = await this.prisma.submittal.create({
      data: {
        companyId,
        projectId: input.projectId,
        number,
        title: input.title,
        specSection: input.specSection,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
      },
    });
    this.audit.record(companyId, actor, "submittal.created", "Submittal", submittal.id, `Created ${number} on "${project.name}": ${submittal.title}`);
    return submittal;
  }

  async update(companyId: string, id: string, input: UpdateSubmittalInput) {
    const submittal = await this.findOrThrow(companyId, id);
    return this.prisma.submittal.update({
      where: { id: submittal.id },
      data: {
        title: input.title,
        specSection: input.specSection,
        dueDate: input.dueDate === null ? null : input.dueDate ? new Date(input.dueDate) : undefined,
      },
    });
  }

  async submit(companyId: string, actor: AuditActor, id: string) {
    const submittal = await this.findOrThrow(companyId, id);
    if (submittal.status !== "draft") throw new BadRequestException("Only a draft submittal can be submitted");

    const updated = await this.prisma.submittal.update({
      where: { id: submittal.id },
      data: { status: "submitted", submittedAt: new Date(), submittedByUserId: actor.userId, submittedByName: actor.name },
    });
    this.audit.record(companyId, actor, "submittal.submitted", "Submittal", submittal.id, `Submitted ${submittal.number} rev.${submittal.revision}`);
    return updated;
  }

  async review(companyId: string, actor: AuditActor, id: string, input: ReviewSubmittalInput) {
    const submittal = await this.findOrThrow(companyId, id);
    if (submittal.status !== "submitted") throw new BadRequestException("Only a submitted item can be reviewed");

    const updated = await this.prisma.submittal.update({
      where: { id: submittal.id },
      data: {
        status: input.decision,
        reviewedAt: new Date(),
        reviewedByUserId: actor.userId,
        reviewedByName: actor.name,
        reviewComments: input.comments,
      },
    });
    this.audit.record(
      companyId,
      actor,
      "submittal.reviewed",
      "Submittal",
      submittal.id,
      `Reviewed ${submittal.number} rev.${submittal.revision}: ${input.decision.replace(/_/g, " ")}`,
    );
    this.webhooks.trigger(companyId, REVIEW_DECISION_WEBHOOK_EVENT[input.decision], {
      submittalId: submittal.id,
      number: submittal.number,
      revision: submittal.revision,
      decision: input.decision,
    });
    return updated;
  }

  async revise(companyId: string, actor: AuditActor, id: string) {
    const submittal = await this.findOrThrow(companyId, id);
    if (submittal.status !== "revise_and_resubmit" && submittal.status !== "rejected") {
      throw new BadRequestException("Only a rejected or revise-and-resubmit item can be revised");
    }

    const rootId = submittal.rootSubmittalId ?? submittal.id;
    const revised = await this.prisma.submittal.create({
      data: {
        companyId,
        projectId: submittal.projectId,
        number: submittal.number,
        revision: submittal.revision + 1,
        rootSubmittalId: rootId,
        title: submittal.title,
        specSection: submittal.specSection,
        dueDate: submittal.dueDate,
      },
    });
    this.audit.record(companyId, actor, "submittal.revised", "Submittal", revised.id, `Created rev.${revised.revision} of ${submittal.number}`);
    return revised;
  }

  /** Only the unambiguous "approved" outcome is bulkable — revise/reject decisions read best with
   * a comment explaining why, which doesn't make sense to share across an arbitrary batch. */
  async bulkApprove(companyId: string, actor: AuditActor, ids: string[]): Promise<BulkActionResult> {
    const result: BulkActionResult = { succeeded: 0, failed: [] };
    for (const id of ids) {
      try {
        await this.review(companyId, actor, id, { decision: "approved" });
        result.succeeded++;
      } catch (err) {
        result.failed.push({ id, message: err instanceof Error ? err.message : String(err) });
      }
    }
    return result;
  }

  private async findOrThrow(companyId: string, id: string) {
    const submittal = await this.prisma.submittal.findFirst({ where: { id, companyId } });
    if (!submittal) throw new NotFoundException("Submittal not found");
    return submittal;
  }

  private async assertProject(companyId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");
    return project;
  }
}
