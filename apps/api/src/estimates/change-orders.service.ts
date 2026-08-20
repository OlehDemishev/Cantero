import { randomBytes } from "node:crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AddChangeOrderLineInput, ClientDecisionInput, CreateChangeOrderInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { PdfService } from "../common/pdf/pdf.service";
import { StorageService } from "../common/storage/storage.service";
import { decodePngDataUrl } from "../common/signature";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { MailService } from "../common/mail/mail.service";
import { WebhooksService } from "../common/webhooks/webhooks.service";
import { calculateEstimate, type EstimateLineInput, type MaterialPrice, type RateItemForCalc } from "./estimate-calc";

/**
 * Change orders are addenda to an already-approved Estimate: extra scope proposed after
 * the original contract, priced with the exact same calc engine and against the parent
 * estimate's own labor rate/markup/tax, then approved internally and sent to the client
 * for a separate sign-off — so the original approved estimate stays untouched history.
 */
@Injectable()
export class ChangeOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfService: PdfService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly webhooks: WebhooksService,
  ) {}

  list(companyId: string, estimateId: string) {
    return this.prisma.changeOrder.findMany({
      where: { companyId, estimateId },
      include: { lines: { include: { rateCatalogItem: true } } },
      orderBy: { number: "asc" },
    });
  }

  async get(companyId: string, id: string) {
    const changeOrder = await this.prisma.changeOrder.findFirst({
      where: { id, companyId },
      include: { lines: { include: { rateCatalogItem: true } } },
    });
    if (!changeOrder) throw new NotFoundException("Change order not found");
    return changeOrder;
  }

  async create(companyId: string, actor: AuditActor, estimateId: string, input: CreateChangeOrderInput) {
    const estimate = await this.prisma.estimate.findFirst({ where: { id: estimateId, companyId } });
    if (!estimate) throw new NotFoundException("Estimate not found");
    if (estimate.status !== "approved") {
      throw new BadRequestException("Change orders can only be raised against an approved estimate");
    }

    const existingCount = await this.prisma.changeOrder.count({ where: { estimateId } });
    const changeOrder = await this.prisma.changeOrder.create({
      data: {
        companyId,
        estimateId,
        number: existingCount + 1,
        title: input.title,
        description: input.description,
      },
      include: { lines: true },
    });

    this.audit.record(
      companyId,
      actor,
      "change_order.created",
      "ChangeOrder",
      changeOrder.id,
      `Created change order CO-${changeOrder.number} "${input.title}" on estimate "${estimate.name}"`,
    );
    return changeOrder;
  }

  async addLine(companyId: string, changeOrderId: string, input: AddChangeOrderLineInput) {
    const changeOrder = await this.findOrThrow(companyId, changeOrderId);
    if (changeOrder.status !== "draft") throw new BadRequestException("Only a draft change order can be edited");

    const rateItem = await this.prisma.rateCatalogItem.findFirst({
      where: { id: input.rateCatalogItemId, companyId },
    });
    if (!rateItem) throw new NotFoundException("Rate catalog item not found");

    await this.prisma.changeOrderLine.create({
      data: { changeOrderId, rateCatalogItemId: input.rateCatalogItemId, quantity: input.quantity },
    });
    return this.recompute(companyId, changeOrderId);
  }

  async removeLine(companyId: string, changeOrderId: string, lineId: string) {
    const changeOrder = await this.findOrThrow(companyId, changeOrderId);
    if (changeOrder.status !== "draft") throw new BadRequestException("Only a draft change order can be edited");

    await this.prisma.changeOrderLine.deleteMany({ where: { id: lineId, changeOrderId } });
    return this.recompute(companyId, changeOrderId);
  }

  /** Locks in the change order once it has at least one line — internal sign-off before it's sent to the client. */
  async approve(companyId: string, actor: AuditActor, changeOrderId: string) {
    const changeOrder = await this.findOrThrow(companyId, changeOrderId);
    if (changeOrder.status !== "draft") throw new BadRequestException("Only a draft change order can be approved");
    if (changeOrder.lines.length === 0) throw new BadRequestException("Add at least one line before approving");

    await this.prisma.changeOrder.update({ where: { id: changeOrderId }, data: { status: "approved" } });
    this.audit.record(
      companyId,
      actor,
      "change_order.approved",
      "ChangeOrder",
      changeOrderId,
      `Approved change order CO-${changeOrder.number} "${changeOrder.title}"`,
    );
    return this.findOrThrow(companyId, changeOrderId);
  }

  /** Generates the public review link, emails it to the client if one is on file, and resets any prior client decision. */
  async send(companyId: string, actor: AuditActor, changeOrderId: string) {
    const changeOrder = await this.findOrThrow(companyId, changeOrderId);
    if (changeOrder.status !== "approved") {
      throw new BadRequestException("Only an approved change order can be sent to the client");
    }

    const estimate = await this.prisma.estimate.findUniqueOrThrow({
      where: { id: changeOrder.estimateId },
      include: { project: true },
    });

    const updated = await this.prisma.changeOrder.update({
      where: { id: changeOrderId },
      data: {
        clientAccessToken: randomBytes(24).toString("hex"),
        sentAt: new Date(),
        clientDecision: "pending",
        decisionAt: null,
        clientDecisionNote: null,
      },
    });
    this.audit.record(
      companyId,
      actor,
      "change_order.sent",
      "ChangeOrder",
      changeOrderId,
      `Sent change order CO-${changeOrder.number} "${changeOrder.title}" to client for review`,
    );
    this.webhooks.trigger(companyId, "change_order.sent", { changeOrderId, title: changeOrder.title });

    const client = estimate.project?.clientId
      ? await this.prisma.client.findUnique({ where: { id: estimate.project.clientId } })
      : null;
    if (client?.email) {
      const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
      const webOrigin = this.config.get<string>("WEB_ORIGIN") ?? "http://localhost:3000";
      const link = `${webOrigin}/change-order/${updated.clientAccessToken}`;
      this.mail.send({
        to: client.email,
        subject: `Change order for ${estimate.name} from ${company.name}`,
        html: `<p>${company.name} has proposed a change order for <strong>${estimate.name}</strong>: <strong>${changeOrder.title}</strong>.</p><p><a href="${link}">View and respond to the change order</a></p>`,
        text: `${company.name} has proposed a change order for ${estimate.name}: ${changeOrder.title}.\n\nView and respond: ${link}`,
      });
    }

    return { ...updated, emailSentTo: client?.email ?? null };
  }

  /** Client-safe view via the public token — no internal cost breakdown, just what the addendum shows. */
  async getByToken(token: string) {
    const changeOrder = await this.prisma.changeOrder.findFirst({
      where: { clientAccessToken: token },
      include: {
        lines: { include: { rateCatalogItem: true }, orderBy: { sortOrder: "asc" } },
        estimate: { select: { name: true } },
        company: { select: { name: true, currency: true } },
      },
    });
    if (!changeOrder) throw new NotFoundException("Change order not found");

    return {
      id: changeOrder.id,
      number: changeOrder.number,
      title: changeOrder.title,
      description: changeOrder.description,
      clientDecision: changeOrder.clientDecision,
      decisionAt: changeOrder.decisionAt,
      clientDecisionNote: changeOrder.clientDecisionNote,
      companyName: changeOrder.company.name,
      currency: changeOrder.company.currency,
      estimateName: changeOrder.estimate.name,
      lines: changeOrder.lines.map((l) => ({
        id: l.id,
        description: l.rateCatalogItem.name,
        unit: l.rateCatalogItem.unit,
        quantity: l.quantity,
        lineTotal: l.lineTotal,
      })),
      subtotal: changeOrder.subtotal,
      markupAmount: changeOrder.markupAmount,
      taxAmount: changeOrder.taxAmount,
      grandTotal: changeOrder.grandTotal,
    };
  }

  async decide(token: string, input: ClientDecisionInput, signerIp?: string) {
    const changeOrder = await this.prisma.changeOrder.findFirst({ where: { clientAccessToken: token } });
    if (!changeOrder) throw new NotFoundException("Change order not found");
    if (changeOrder.clientDecision !== "pending") {
      throw new BadRequestException("This change order has already been decided");
    }

    let signatureImageKey: string | undefined;
    if (input.decision === "approved" && input.signatureDataUrl) {
      const stored = await this.storage.save(
        changeOrder.companyId,
        "signature.png",
        decodePngDataUrl(input.signatureDataUrl),
      );
      signatureImageKey = stored.storageKey;
    }

    const updated = await this.prisma.changeOrder.update({
      where: { id: changeOrder.id },
      data: {
        clientDecision: input.decision,
        decisionAt: new Date(),
        clientDecisionNote: input.note,
        signerName: input.decision === "approved" ? input.signerName : undefined,
        signatureImageKey,
        signedIp: input.decision === "approved" ? signerIp : undefined,
      },
    });

    this.audit.record(
      changeOrder.companyId,
      { name: "Client" },
      input.decision === "approved" ? "change_order.client_approved" : "change_order.client_rejected",
      "ChangeOrder",
      changeOrder.id,
      `Client ${input.decision} change order CO-${changeOrder.number} "${changeOrder.title}"${input.note ? ` — "${input.note}"` : ""}`,
    );
    this.webhooks.trigger(
      changeOrder.companyId,
      input.decision === "approved" ? "change_order.client_approved" : "change_order.client_rejected",
      { changeOrderId: changeOrder.id, title: changeOrder.title, decision: input.decision },
    );

    return { clientDecision: updated.clientDecision };
  }

  async getSignature(companyId: string, changeOrderId: string): Promise<Buffer> {
    const changeOrder = await this.prisma.changeOrder.findFirst({ where: { id: changeOrderId, companyId } });
    if (!changeOrder) throw new NotFoundException("Change order not found");
    if (!changeOrder.signatureImageKey) throw new NotFoundException("No signature on file");
    return this.storage.read(changeOrder.signatureImageKey);
  }

  async generatePdf(companyId: string, changeOrderId: string): Promise<Buffer> {
    const changeOrder = await this.findOrThrow(companyId, changeOrderId);
    const estimate = await this.prisma.estimate.findUniqueOrThrow({ where: { id: changeOrder.estimateId } });
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    const logoBuffer = company.logoStorageKey ? await this.storage.read(company.logoStorageKey) : undefined;
    const signatureImageBuffer = changeOrder.signatureImageKey
      ? await this.storage.read(changeOrder.signatureImageKey)
      : undefined;

    return this.pdfService.render({
      title: `Change Order CO-${changeOrder.number} — ${changeOrder.title}`,
      subtitle: estimate.name,
      meta: [
        { label: "Status", value: changeOrder.status },
        { label: "Currency", value: company.currency },
      ],
      tableHeader: ["Item", "Qty", "Unit", "Materials", "Labor", "Line total"],
      tableRows: changeOrder.lines.map((line) => ({
        cells: [
          line.rateCatalogItem.name,
          line.quantity.toString(),
          line.rateCatalogItem.unit,
          line.materialsCost.toString(),
          line.laborCost.toString(),
          line.lineTotal.toString(),
        ],
      })),
      totals: [
        { label: "Materials total", value: `${changeOrder.materialsCostTotal} ${company.currency}` },
        { label: "Labor total", value: `${changeOrder.laborCostTotal} ${company.currency}` },
        { label: "Subtotal", value: `${changeOrder.subtotal} ${company.currency}` },
        { label: `Markup (${estimate.markupPercent}%)`, value: `${changeOrder.markupAmount} ${company.currency}` },
        { label: `Tax (${estimate.taxPercent}%)`, value: `${changeOrder.taxAmount} ${company.currency}` },
        { label: "Grand total", value: `${changeOrder.grandTotal} ${company.currency}`, emphasize: true },
      ],
      branding: { logoBuffer, accentColor: company.brandColor ?? undefined },
      signature:
        changeOrder.clientDecision === "approved" && changeOrder.signerName && changeOrder.decisionAt
          ? { imageBuffer: signatureImageBuffer, signerName: changeOrder.signerName, signedAt: changeOrder.decisionAt }
          : undefined,
    });
  }

  /** Re-runs the pure calc engine over every line and persists the resulting costs/totals, against the parent estimate's own rates. */
  private async recompute(companyId: string, changeOrderId: string) {
    const changeOrder = await this.findOrThrow(companyId, changeOrderId);
    const estimate = await this.prisma.estimate.findUniqueOrThrow({ where: { id: changeOrder.estimateId } });

    if (changeOrder.lines.length === 0) {
      await this.prisma.changeOrder.update({
        where: { id: changeOrderId },
        data: { materialsCostTotal: 0, laborCostTotal: 0, subtotal: 0, markupAmount: 0, taxAmount: 0, grandTotal: 0 },
      });
      return this.findOrThrow(companyId, changeOrderId);
    }

    const lineInputs: EstimateLineInput[] = changeOrder.lines.map((l) => ({
      id: l.id,
      rateCatalogItemId: l.rateCatalogItemId,
      quantity: Number(l.quantity),
    }));

    const rateItemIds = [...new Set(lineInputs.map((l) => l.rateCatalogItemId))];
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

    const result = calculateEstimate(lineInputs, rateItemsById, materialPricesById, {
      laborRatePerHour: Number(estimate.laborRatePerHour),
      markupPercent: Number(estimate.markupPercent),
      taxPercent: Number(estimate.taxPercent),
    });

    await this.prisma.$transaction([
      ...result.lines.map((line) =>
        this.prisma.changeOrderLine.update({
          where: { id: line.id },
          data: { materialsCost: line.materialsCost, laborCost: line.laborCost, lineTotal: line.lineTotal },
        }),
      ),
      this.prisma.changeOrder.update({
        where: { id: changeOrderId },
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

    return this.findOrThrow(companyId, changeOrderId);
  }

  private async findOrThrow(companyId: string, id: string) {
    const changeOrder = await this.prisma.changeOrder.findFirst({
      where: { id, companyId },
      include: { lines: { include: { rateCatalogItem: true }, orderBy: { sortOrder: "asc" } } },
    });
    if (!changeOrder) throw new NotFoundException("Change order not found");
    return changeOrder;
  }
}
