import { randomBytes } from "node:crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Estimate } from "@prisma/client";
import type {
  ClientDecisionInput,
  CreateEstimateInput,
  CreateEstimateLineInput,
  CreateFromTemplateInput,
  CreateVariantInput,
} from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { PdfService } from "../common/pdf/pdf.service";
import { StorageService } from "../common/storage/storage.service";
import { decodePngDataUrl } from "../common/signature";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { MailService } from "../common/mail/mail.service";
import { WebhooksService } from "../common/webhooks/webhooks.service";
import {
  calculateEstimate,
  type EstimateCalcOptions,
  type EstimateLineInput,
  type MaterialPrice,
  type RateItemForCalc,
} from "./estimate-calc";

interface RevisionLineSnapshot {
  rateCatalogItemCode: string;
  rateCatalogItemName: string;
  unit: string;
  quantity: number;
  materialsCost: number;
  laborCost: number;
  lineTotal: number;
}

@Injectable()
export class EstimatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfService: PdfService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly webhooks: WebhooksService,
  ) {}

  list(companyId: string) {
    return this.prisma.estimate.findMany({ where: { companyId, isTemplate: false }, include: { project: true } });
  }

  listTemplates(companyId: string) {
    return this.prisma.estimate.findMany({ where: { companyId, isTemplate: true }, orderBy: { name: "asc" } });
  }

  /** Recomputes the estimate live (without persisting) and flags it if that differs from the stored totals — a catalog price moved since it was last saved. */
  async get(companyId: string, id: string) {
    const estimate = await this.findOrThrow(companyId, id);
    if (estimate.isTemplate || estimate.lines.length === 0) {
      return { ...estimate, isStale: false };
    }
    const result = await this.computeForLines(
      companyId,
      estimate.lines.map((l) => ({ id: l.id, rateCatalogItemId: l.rateCatalogItemId, quantity: Number(l.quantity) })),
      {
        laborRatePerHour: Number(estimate.laborRatePerHour),
        markupPercent: Number(estimate.markupPercent),
        taxPercent: Number(estimate.taxPercent),
      },
    );
    return { ...estimate, isStale: result.grandTotal !== Number(estimate.grandTotal) };
  }

  async create(companyId: string, input: CreateEstimateInput) {
    const project = await this.prisma.project.findFirst({ where: { id: input.projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");

    return this.prisma.estimate.create({
      data: { ...input, companyId },
      include: { lines: true, sections: true },
    });
  }

  async addLine(companyId: string, estimateId: string, input: CreateEstimateLineInput) {
    await this.findOrThrow(companyId, estimateId);
    const rateItem = await this.prisma.rateCatalogItem.findFirst({
      where: { id: input.rateCatalogItemId, companyId },
    });
    if (!rateItem) throw new NotFoundException("Rate catalog item not found");

    await this.prisma.estimateLine.create({
      data: {
        estimateId,
        rateCatalogItemId: input.rateCatalogItemId,
        quantity: input.quantity,
        sectionId: input.sectionId,
      },
    });
    return this.recalculate(companyId, estimateId);
  }

  /** Re-runs the pure calc engine over every line and persists the resulting costs/totals. */
  async recalculate(companyId: string, estimateId: string) {
    const estimate = await this.findOrThrow(companyId, estimateId);
    if (estimate.lines.length === 0) {
      return this.prisma.estimate.update({
        where: { id: estimateId },
        data: { materialsCostTotal: 0, laborCostTotal: 0, subtotal: 0, markupAmount: 0, taxAmount: 0, grandTotal: 0 },
        include: { lines: true, sections: true },
      });
    }

    const result = await this.computeForLines(
      companyId,
      estimate.lines.map((l) => ({ id: l.id, rateCatalogItemId: l.rateCatalogItemId, quantity: Number(l.quantity) })),
      {
        laborRatePerHour: Number(estimate.laborRatePerHour),
        markupPercent: Number(estimate.markupPercent),
        taxPercent: Number(estimate.taxPercent),
      },
    );

    await this.prisma.$transaction([
      ...result.lines.map((line) =>
        this.prisma.estimateLine.update({
          where: { id: line.id },
          data: { materialsCost: line.materialsCost, laborCost: line.laborCost, lineTotal: line.lineTotal },
        }),
      ),
      this.prisma.estimate.update({
        where: { id: estimateId },
        data: {
          materialsCostTotal: result.materialsCostTotal,
          laborCostTotal: result.laborCostTotal,
          subtotal: result.subtotal,
          markupAmount: result.markupAmount,
          taxAmount: result.taxAmount,
          grandTotal: result.grandTotal,
        },
      }),
    ]);

    return this.findOrThrow(companyId, estimateId);
  }

  /**
   * Locks in the material requirement list and snapshots the current state into
   * an EstimateRevision. Callable more than once: editing an approved estimate
   * and approving again creates the next revision instead of being blocked.
   *
   * Above the company's approval threshold, a draft/pending_approval estimate needs
   * `requiredApprovalCount` distinct internal approvals before it finalizes — each call
   * to this method from a not-yet-fully-approved estimate records one step instead of
   * finalizing immediately. Re-approving an already-`approved` estimate after edits
   * bypasses the chain (it already cleared the gate once) and finalizes directly, same
   * as when no threshold is configured.
   */
  async approve(companyId: string, actor: AuditActor, estimateId: string) {
    const estimate = await this.recalculate(companyId, estimateId);

    if (estimate.status !== "approved") {
      const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
      const threshold = company.approvalThresholdAmount;
      if (threshold != null && Number(estimate.grandTotal) >= Number(threshold)) {
        return this.recordApprovalStep(companyId, actor, estimate, company.requiredApprovalCount);
      }
    }

    return this.finalizeApproval(companyId, actor, estimate);
  }

  /** Records one step of a multi-approver chain; finalizes once the required count is reached. */
  private async recordApprovalStep(
    companyId: string,
    actor: AuditActor,
    estimate: Awaited<ReturnType<typeof this.recalculate>>,
    requiredCount: number,
  ) {
    if (!actor.userId) throw new BadRequestException("Only a signed-in user can approve");

    const existing = await this.prisma.estimateApproval.findUnique({
      where: { estimateId_userId: { estimateId: estimate.id, userId: actor.userId } },
    });
    if (existing) throw new BadRequestException("You have already approved this estimate");

    await this.prisma.$transaction([
      this.prisma.estimateApproval.create({
        data: { estimateId: estimate.id, userId: actor.userId, actorName: actor.name },
      }),
      this.prisma.estimate.update({ where: { id: estimate.id }, data: { status: "pending_approval" } }),
    ]);

    const approvalCount = await this.prisma.estimateApproval.count({ where: { estimateId: estimate.id } });
    this.audit.record(
      companyId,
      actor,
      "estimate.approval_step",
      "Estimate",
      estimate.id,
      `Approved step ${approvalCount}/${requiredCount} for "${estimate.name}"`,
    );

    if (approvalCount >= requiredCount) {
      return this.finalizeApproval(companyId, actor, estimate);
    }
    return this.findOrThrow(companyId, estimate.id);
  }

  private async finalizeApproval(
    companyId: string,
    actor: AuditActor,
    estimate: Awaited<ReturnType<typeof this.recalculate>>,
  ) {
    const estimateId = estimate.id;
    const lineInputs = estimate.lines.map((l) => ({
      id: l.id,
      rateCatalogItemId: l.rateCatalogItemId,
      quantity: Number(l.quantity),
    }));
    const calcOptions: EstimateCalcOptions = {
      laborRatePerHour: Number(estimate.laborRatePerHour),
      markupPercent: Number(estimate.markupPercent),
      taxPercent: Number(estimate.taxPercent),
    };
    const result = await this.computeForLines(companyId, lineInputs, calcOptions);

    const rateItemIds = [...new Set(estimate.lines.map((l) => l.rateCatalogItemId))];
    const rateItemsInfo = await this.prisma.rateCatalogItem.findMany({
      where: { id: { in: rateItemIds }, companyId },
      select: { id: true, code: true, name: true, unit: true },
    });
    const rateItemInfoById = Object.fromEntries(rateItemsInfo.map((r) => [r.id, r]));

    const revisionLines: RevisionLineSnapshot[] = estimate.lines.map((line) => {
      const info = rateItemInfoById[line.rateCatalogItemId];
      return {
        rateCatalogItemCode: info?.code ?? "",
        rateCatalogItemName: info?.name ?? line.rateCatalogItemId,
        unit: info?.unit ?? "",
        quantity: Number(line.quantity),
        materialsCost: Number(line.materialsCost),
        laborCost: Number(line.laborCost),
        lineTotal: Number(line.lineTotal),
      };
    });

    await this.prisma.$transaction([
      this.prisma.estimateMaterialRequirement.deleteMany({ where: { estimateId } }),
      this.prisma.estimateMaterialRequirement.createMany({
        data: result.materialRequirements.map((r) => ({
          estimateId,
          materialCatalogItemId: r.materialCatalogItemId,
          quantity: r.quantity,
          unit: r.unit,
        })),
      }),
      this.prisma.estimateRevision.create({
        data: {
          estimateId,
          versionNumber: estimate.currentVersion,
          name: estimate.name,
          laborRatePerHour: estimate.laborRatePerHour,
          markupPercent: estimate.markupPercent,
          taxPercent: estimate.taxPercent,
          materialsCostTotal: estimate.materialsCostTotal,
          laborCostTotal: estimate.laborCostTotal,
          subtotal: estimate.subtotal,
          markupAmount: estimate.markupAmount,
          taxAmount: estimate.taxAmount,
          grandTotal: estimate.grandTotal,
          lines: revisionLines as unknown as object,
        },
      }),
      this.prisma.estimate.update({
        where: { id: estimateId },
        data: { status: "approved", currentVersion: { increment: 1 } },
      }),
    ]);

    this.audit.record(companyId, actor, "estimate.approved", "Estimate", estimateId, `Approved estimate "${estimate.name}"`);
    return this.findOrThrow(companyId, estimateId);
  }

  async listRevisions(companyId: string, estimateId: string) {
    await this.findOrThrow(companyId, estimateId);
    return this.prisma.estimateRevision.findMany({ where: { estimateId }, orderBy: { versionNumber: "desc" } });
  }

  async getRevision(companyId: string, estimateId: string, revisionId: string) {
    await this.findOrThrow(companyId, estimateId);
    const revision = await this.prisma.estimateRevision.findFirst({ where: { id: revisionId, estimateId } });
    if (!revision) throw new NotFoundException("Revision not found");
    return revision;
  }

  /** Generates (or regenerates) the public review link, emails it to the client if one is on file, and resets any prior client decision. */
  async send(companyId: string, actor: AuditActor, estimateId: string) {
    const estimate = await this.findOrThrow(companyId, estimateId);
    if (estimate.status !== "approved") {
      throw new BadRequestException("Only an approved estimate can be sent to the client");
    }
    const updated = await this.prisma.estimate.update({
      where: { id: estimateId },
      data: {
        clientAccessToken: randomBytes(24).toString("hex"),
        sentAt: new Date(),
        clientDecision: "pending",
        decisionAt: null,
        clientDecisionNote: null,
      },
    });
    this.audit.record(companyId, actor, "estimate.sent", "Estimate", estimateId, `Sent estimate "${estimate.name}" to client for review`);
    this.webhooks.trigger(companyId, "estimate.sent", { estimateId, name: estimate.name });

    const client = estimate.project?.clientId
      ? await this.prisma.client.findUnique({ where: { id: estimate.project.clientId } })
      : null;
    if (client?.email) {
      const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
      const webOrigin = this.config.get<string>("WEB_ORIGIN") ?? "http://localhost:3000";
      const link = `${webOrigin}/estimate/${updated.clientAccessToken}`;
      this.mail.send({
        to: client.email,
        subject: `Estimate from ${company.name}: ${estimate.name}`,
        html: `<p>${company.name} has sent you an estimate for review: <strong>${estimate.name}</strong>.</p><p><a href="${link}">View and respond to the estimate</a></p>`,
        text: `${company.name} has sent you an estimate for review: ${estimate.name}.\n\nView and respond: ${link}`,
      });
    }

    return { ...updated, emailSentTo: client?.email ?? null };
  }

  /** Clones the current sections/lines into a sibling option (e.g. "Basic" vs "Premium") for the same project. */
  async createVariant(companyId: string, estimateId: string, input: CreateVariantInput) {
    const source = await this.findOrThrow(companyId, estimateId);
    const rootId = source.variantOfId ?? source.id;
    const variant = await this.prisma.estimate.create({
      data: {
        companyId,
        projectId: source.projectId,
        name: source.name,
        laborRatePerHour: source.laborRatePerHour,
        markupPercent: source.markupPercent,
        taxPercent: source.taxPercent,
        variantOfId: rootId,
        variantLabel: input.label,
      },
    });
    return this.cloneSectionsAndLines(companyId, source.sections, source.lines, variant.id);
  }

  async listVariants(companyId: string, estimateId: string) {
    const source = await this.findOrThrow(companyId, estimateId);
    const rootId = source.variantOfId ?? source.id;
    return this.prisma.estimate.findMany({
      where: { companyId, OR: [{ id: rootId }, { variantOfId: rootId }] },
      orderBy: { createdAt: "asc" },
    });
  }

  /** Client-safe view via the public token — no internal cost breakdown, just what a quote shows. */
  async getByToken(token: string) {
    const estimate = await this.prisma.estimate.findFirst({
      where: { clientAccessToken: token },
      include: {
        lines: { orderBy: { sortOrder: "asc" }, include: { rateCatalogItem: true } },
        project: true,
        company: { select: { name: true, currency: true } },
      },
    });
    if (!estimate) throw new NotFoundException("Estimate not found");

    return {
      id: estimate.id,
      name: estimate.name,
      variantLabel: estimate.variantLabel,
      clientDecision: estimate.clientDecision,
      decisionAt: estimate.decisionAt,
      clientDecisionNote: estimate.clientDecisionNote,
      companyName: estimate.company.name,
      currency: estimate.company.currency,
      projectName: estimate.project?.name ?? null,
      lines: estimate.lines.map((l) => ({
        id: l.id,
        description: l.rateCatalogItem.name,
        unit: l.rateCatalogItem.unit,
        quantity: l.quantity,
        lineTotal: l.lineTotal,
      })),
      subtotal: estimate.subtotal,
      markupAmount: estimate.markupAmount,
      taxAmount: estimate.taxAmount,
      grandTotal: estimate.grandTotal,
    };
  }

  /** Client approval auto-declines sibling variants still pending — picking one option settles the others. */
  async decide(token: string, input: ClientDecisionInput, signerIp?: string) {
    const estimate = await this.prisma.estimate.findFirst({ where: { clientAccessToken: token } });
    if (!estimate) throw new NotFoundException("Estimate not found");
    return this.applyDecision(estimate, input, signerIp);
  }

  /** Same decision flow as decide(), reached from the client portal (JWT-authenticated) instead of a one-off email token. */
  async decideForClient(companyId: string, clientId: string, estimateId: string, input: ClientDecisionInput, signerIp?: string) {
    const estimate = await this.prisma.estimate.findFirst({
      where: { id: estimateId, companyId, sentAt: { not: null }, project: { clientId } },
    });
    if (!estimate) throw new NotFoundException("Estimate not found");
    return this.applyDecision(estimate, input, signerIp);
  }

  private async applyDecision(estimate: Estimate, input: ClientDecisionInput, signerIp?: string) {
    if (estimate.clientDecision !== "pending") {
      throw new BadRequestException("This estimate has already been decided");
    }

    let signatureImageKey: string | undefined;
    if (input.decision === "approved" && input.signatureDataUrl) {
      const stored = await this.storage.save(estimate.companyId, "signature.png", decodePngDataUrl(input.signatureDataUrl));
      signatureImageKey = stored.storageKey;
    }

    const updated = await this.prisma.estimate.update({
      where: { id: estimate.id },
      data: {
        clientDecision: input.decision,
        decisionAt: new Date(),
        clientDecisionNote: input.note,
        signerName: input.decision === "approved" ? input.signerName : undefined,
        signatureImageKey,
        signedIp: input.decision === "approved" ? signerIp : undefined,
      },
    });

    if (input.decision === "approved") {
      const rootId = estimate.variantOfId ?? estimate.id;
      await this.prisma.estimate.updateMany({
        where: {
          companyId: estimate.companyId,
          id: { not: estimate.id },
          OR: [{ id: rootId }, { variantOfId: rootId }],
          clientDecision: "pending",
        },
        data: {
          clientDecision: "rejected",
          decisionAt: new Date(),
          clientDecisionNote: "Auto-declined — a sibling variant was approved",
        },
      });
    }

    this.audit.record(
      estimate.companyId,
      { name: "Client" },
      input.decision === "approved" ? "estimate.client_approved" : "estimate.client_rejected",
      "Estimate",
      estimate.id,
      `Client ${input.decision} estimate "${estimate.name}"${input.note ? ` — "${input.note}"` : ""}`,
    );
    this.webhooks.trigger(estimate.companyId, input.decision === "approved" ? "estimate.client_approved" : "estimate.client_rejected", {
      estimateId: estimate.id,
      name: estimate.name,
      decision: input.decision,
    });

    return { clientDecision: updated.clientDecision };
  }

  /** Clones the current sections/lines into a new, project-less template estimate. */
  async saveAsTemplate(companyId: string, estimateId: string, name: string) {
    const estimate = await this.findOrThrow(companyId, estimateId);
    const template = await this.prisma.estimate.create({
      data: {
        companyId,
        name,
        isTemplate: true,
        laborRatePerHour: estimate.laborRatePerHour,
        markupPercent: estimate.markupPercent,
        taxPercent: estimate.taxPercent,
      },
    });
    return this.cloneSectionsAndLines(companyId, estimate.sections, estimate.lines, template.id);
  }

  /** Clones a template's sections/lines into a brand-new project estimate, then recalculates against current prices. */
  async createFromTemplate(companyId: string, templateId: string, input: CreateFromTemplateInput) {
    const template = await this.prisma.estimate.findFirst({
      where: { id: templateId, companyId, isTemplate: true },
      include: { sections: { orderBy: { sortOrder: "asc" } }, lines: { orderBy: { sortOrder: "asc" } } },
    });
    if (!template) throw new NotFoundException("Template not found");

    const estimate = await this.prisma.estimate.create({
      data: {
        companyId,
        projectId: input.projectId,
        name: input.name,
        laborRatePerHour: input.laborRatePerHour,
        markupPercent: input.markupPercent,
        taxPercent: input.taxPercent,
      },
    });
    return this.cloneSectionsAndLines(companyId, template.sections, template.lines, estimate.id);
  }

  private async cloneSectionsAndLines(
    companyId: string,
    sourceSections: { id: string; name: string; sortOrder: number }[],
    sourceLines: { rateCatalogItemId: string; quantity: unknown; sectionId: string | null; sortOrder: number }[],
    targetEstimateId: string,
  ) {
    const sectionIdMap = new Map<string, string>();
    for (const section of sourceSections) {
      const created = await this.prisma.estimateSection.create({
        data: { estimateId: targetEstimateId, name: section.name, sortOrder: section.sortOrder },
      });
      sectionIdMap.set(section.id, created.id);
    }

    if (sourceLines.length > 0) {
      await this.prisma.estimateLine.createMany({
        data: sourceLines.map((l) => ({
          estimateId: targetEstimateId,
          rateCatalogItemId: l.rateCatalogItemId,
          quantity: l.quantity as never,
          sectionId: l.sectionId ? sectionIdMap.get(l.sectionId) : undefined,
          sortOrder: l.sortOrder,
        })),
      });
      return this.recalculate(companyId, targetEstimateId);
    }
    return this.findOrThrow(companyId, targetEstimateId);
  }

  /** Shared rate/material lookup + pure calc — used by recalculate, approve, and the stale check. */
  private async computeForLines(companyId: string, lines: EstimateLineInput[], options: EstimateCalcOptions) {
    if (lines.length === 0) {
      return {
        lines: [],
        materialsCostTotal: 0,
        laborCostTotal: 0,
        subtotal: 0,
        markupAmount: 0,
        taxAmount: 0,
        grandTotal: 0,
        materialRequirements: [],
      };
    }

    const rateItemIds = [...new Set(lines.map((l) => l.rateCatalogItemId))];
    const rateItems = await this.prisma.rateCatalogItem.findMany({
      where: { id: { in: rateItemIds }, companyId },
      include: { materials: true },
    });
    const rateItemsById: Record<string, RateItemForCalc> = Object.fromEntries(
      rateItems.map((ri) => [
        ri.id,
        {
          id: ri.id,
          laborHoursPerUnit: Number(ri.laborHoursPerUnit),
          materials: ri.materials.map((m) => ({
            materialCatalogItemId: m.materialCatalogItemId,
            quantityPerUnit: Number(m.quantityPerUnit),
            wasteFactorPercent: Number(m.wasteFactorPercent),
          })),
        },
      ]),
    );

    const materialIds = [...new Set(rateItems.flatMap((ri) => ri.materials.map((m) => m.materialCatalogItemId)))];
    const materials = await this.prisma.materialCatalogItem.findMany({ where: { id: { in: materialIds }, companyId } });
    const materialPricesById: Record<string, MaterialPrice> = Object.fromEntries(
      materials.map((m) => [m.id, { unitPrice: Number(m.defaultUnitPrice), unit: m.unit }]),
    );

    return calculateEstimate(lines, rateItemsById, materialPricesById, options);
  }

  async generatePdf(companyId: string, estimateId: string): Promise<Buffer> {
    const estimate = await this.findOrThrow(companyId, estimateId);
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    const rateItems = await this.prisma.rateCatalogItem.findMany({
      where: { id: { in: estimate.lines.map((l) => l.rateCatalogItemId) }, companyId },
    });
    const rateItemsById = Object.fromEntries(rateItems.map((ri) => [ri.id, ri]));
    const logoBuffer = company.logoStorageKey ? await this.storage.read(company.logoStorageKey) : undefined;
    const signatureImageBuffer = estimate.signatureImageKey ? await this.storage.read(estimate.signatureImageKey) : undefined;

    return this.pdfService.render({
      title: `Estimate — ${estimate.name}`,
      subtitle: estimate.project?.name ?? "",
      meta: [
        { label: "Status", value: estimate.status },
        { label: "Currency", value: company.currency },
      ],
      tableHeader: ["Item", "Qty", "Unit", "Materials", "Labor", "Line total"],
      tableRows: estimate.lines.map((line) => {
        const rateItem = rateItemsById[line.rateCatalogItemId];
        return {
          cells: [
            rateItem?.name ?? line.rateCatalogItemId,
            line.quantity.toString(),
            rateItem?.unit ?? "",
            line.materialsCost.toString(),
            line.laborCost.toString(),
            line.lineTotal.toString(),
          ],
        };
      }),
      totals: [
        { label: "Materials total", value: `${estimate.materialsCostTotal} ${company.currency}` },
        { label: "Labor total", value: `${estimate.laborCostTotal} ${company.currency}` },
        { label: "Subtotal", value: `${estimate.subtotal} ${company.currency}` },
        { label: `Markup (${estimate.markupPercent}%)`, value: `${estimate.markupAmount} ${company.currency}` },
        { label: `Tax (${estimate.taxPercent}%)`, value: `${estimate.taxAmount} ${company.currency}` },
        { label: "Grand total", value: `${estimate.grandTotal} ${company.currency}`, emphasize: true },
      ],
      branding: { logoBuffer, accentColor: company.brandColor ?? undefined },
      signature:
        estimate.clientDecision === "approved" && estimate.signerName && estimate.decisionAt
          ? { imageBuffer: signatureImageBuffer, signerName: estimate.signerName, signedAt: estimate.decisionAt }
          : undefined,
    });
  }

  async getSignature(companyId: string, estimateId: string): Promise<Buffer> {
    const estimate = await this.prisma.estimate.findFirst({ where: { id: estimateId, companyId } });
    if (!estimate) throw new NotFoundException("Estimate not found");
    if (!estimate.signatureImageKey) throw new NotFoundException("No signature on file");
    return this.storage.read(estimate.signatureImageKey);
  }

  /**
   * "Companies who used X also used Y" for rate items — a co-occurrence heuristic over the
   * company's own approved-estimate history, not a real ML model. With no lines yet on this
   * estimate, falls back to the company's most-used rate items overall so a blank estimate still
   * gets useful suggestions.
   */
  async suggestedLines(companyId: string, estimateId: string, limit = 8) {
    const estimate = await this.findOrThrow(companyId, estimateId);
    const currentItemIds = new Set(estimate.lines.map((l) => l.rateCatalogItemId));

    let siblingLines: { rateCatalogItemId: string }[];
    if (currentItemIds.size === 0) {
      siblingLines = await this.prisma.estimateLine.findMany({
        where: { estimate: { companyId, status: "approved" } },
        select: { rateCatalogItemId: true },
      });
    } else {
      const matches = await this.prisma.estimateLine.findMany({
        where: { estimate: { companyId, status: "approved" }, rateCatalogItemId: { in: [...currentItemIds] } },
        select: { estimateId: true },
      });
      siblingLines = await this.prisma.estimateLine.findMany({
        where: { estimateId: { in: [...new Set(matches.map((m) => m.estimateId))] } },
        select: { rateCatalogItemId: true },
      });
    }

    const counts = new Map<string, number>();
    for (const line of siblingLines) {
      if (currentItemIds.has(line.rateCatalogItemId)) continue;
      counts.set(line.rateCatalogItemId, (counts.get(line.rateCatalogItemId) ?? 0) + 1);
    }

    const rankedIds = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
    if (rankedIds.length === 0) return [];

    const items = await this.prisma.rateCatalogItem.findMany({ where: { id: { in: rankedIds.map(([id]) => id) } } });
    const itemById = new Map(items.map((i) => [i.id, i]));
    return rankedIds
      .map(([id, count]) => ({ item: itemById.get(id), count }))
      .filter((r): r is { item: NonNullable<typeof r.item>; count: number } => !!r.item);
  }

  private async findOrThrow(companyId: string, id: string) {
    const estimate = await this.prisma.estimate.findFirst({
      where: { id, companyId },
      include: {
        lines: { orderBy: { sortOrder: "asc" } },
        sections: { orderBy: { sortOrder: "asc" } },
        requirements: { include: { materialCatalogItem: true } },
        project: true,
        approvals: { orderBy: { approvedAt: "asc" } },
      },
    });
    if (!estimate) throw new NotFoundException("Estimate not found");
    return estimate;
  }
}
