import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateMaterialRfqInput, SubmitMaterialRfqQuoteInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";

const INCLUDE_DETAIL = {
  project: { select: { id: true, name: true } },
  lines: {
    include: {
      materialCatalogItem: { select: { id: true, code: true, name: true, unit: true } },
      quotes: { include: { supplier: { select: { id: true, name: true } } }, orderBy: { unitPrice: "asc" as const } },
    },
  },
} as const;

@Injectable()
export class MaterialRfqsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(companyId: string) {
    return this.prisma.materialRfq.findMany({
      where: { companyId },
      include: { project: { select: { id: true, name: true } }, lines: { select: { id: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async get(companyId: string, id: string) {
    return this.findOrThrow(companyId, id);
  }

  async create(companyId: string, actor: AuditActor, input: CreateMaterialRfqInput) {
    if (input.projectId) {
      const project = await this.prisma.project.findFirst({ where: { id: input.projectId, companyId } });
      if (!project) throw new NotFoundException("Project not found");
    }

    const materialIds = input.lines.map((l) => l.materialCatalogItemId);
    const materials = await this.prisma.materialCatalogItem.findMany({ where: { id: { in: materialIds }, companyId } });
    if (materials.length !== new Set(materialIds).size) {
      throw new BadRequestException("One or more materials don't belong to this company");
    }

    const rfq = await this.prisma.materialRfq.create({
      data: {
        companyId,
        title: input.title,
        projectId: input.projectId,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        lines: { create: input.lines.map((l) => ({ materialCatalogItemId: l.materialCatalogItemId, quantity: l.quantity })) },
      },
      include: INCLUDE_DETAIL,
    });
    this.audit.record(companyId, actor, "material_rfq.created", "MaterialRfq", rfq.id, `Created RFQ "${rfq.title}" with ${input.lines.length} line(s)`);
    return rfq;
  }

  /** Upsert by (rfqLineId, supplierId) — resubmitting from the same supplier updates their price rather than duplicating. */
  async submitQuote(companyId: string, rfqId: string, input: SubmitMaterialRfqQuoteInput) {
    const rfq = await this.findOrThrow(companyId, rfqId);
    if (rfq.status !== "open") throw new BadRequestException("This RFQ is closed");

    const line = rfq.lines.find((l) => l.id === input.rfqLineId);
    if (!line) throw new NotFoundException("RFQ line not found on this request");

    const supplier = await this.prisma.supplier.findFirst({ where: { id: input.supplierId, companyId } });
    if (!supplier) throw new NotFoundException("Supplier not found");

    await this.prisma.materialRfqQuote.upsert({
      where: { rfqLineId_supplierId: { rfqLineId: input.rfqLineId, supplierId: input.supplierId } },
      create: { rfqLineId: input.rfqLineId, supplierId: input.supplierId, unitPrice: input.unitPrice, notes: input.notes },
      update: { unitPrice: input.unitPrice, notes: input.notes, submittedAt: new Date() },
    });
    return this.findOrThrow(companyId, rfqId);
  }

  /** Awards a specific supplier's quote for one line — awarding is per-line, not per-RFQ, so other suppliers can still win other lines. */
  async awardLine(companyId: string, actor: AuditActor, rfqId: string, quoteId: string) {
    const rfq = await this.findOrThrow(companyId, rfqId);
    const line = rfq.lines.find((l) => l.quotes.some((q) => q.id === quoteId));
    if (!line) throw new NotFoundException("Quote not found on this request");
    const quote = line.quotes.find((q) => q.id === quoteId)!;

    await this.prisma.$transaction([
      this.prisma.materialRfqQuote.updateMany({ where: { rfqLineId: line.id }, data: { isAwarded: false } }),
      this.prisma.materialRfqQuote.update({ where: { id: quoteId }, data: { isAwarded: true } }),
    ]);
    this.audit.record(
      companyId,
      actor,
      "material_rfq.line_awarded",
      "MaterialRfq",
      rfqId,
      `Awarded ${line.materialCatalogItem.name} to ${quote.supplier.name} at ${quote.unitPrice}/${line.materialCatalogItem.unit}`,
    );
    return this.findOrThrow(companyId, rfqId);
  }

  async close(companyId: string, actor: AuditActor, rfqId: string) {
    const rfq = await this.findOrThrow(companyId, rfqId);
    if (rfq.status !== "open") throw new BadRequestException("This RFQ is already closed");

    await this.prisma.materialRfq.update({ where: { id: rfqId }, data: { status: "closed" } });
    this.audit.record(companyId, actor, "material_rfq.closed", "MaterialRfq", rfqId, `Closed RFQ "${rfq.title}"`);
    return this.findOrThrow(companyId, rfqId);
  }

  private async findOrThrow(companyId: string, id: string) {
    const rfq = await this.prisma.materialRfq.findFirst({ where: { id, companyId }, include: INCLUDE_DETAIL });
    if (!rfq) throw new NotFoundException("RFQ not found");
    return rfq;
  }
}
