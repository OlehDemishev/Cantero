import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreateEstimateInput, CreateEstimateLineInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { PdfService } from "../common/pdf/pdf.service";
import { calculateEstimate, type MaterialPrice, type RateItemForCalc } from "./estimate-calc";

@Injectable()
export class EstimatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfService: PdfService,
  ) {}

  list(companyId: string) {
    return this.prisma.estimate.findMany({ where: { companyId }, include: { project: true } });
  }

  async get(companyId: string, id: string) {
    const estimate = await this.findOrThrow(companyId, id);
    return estimate;
  }

  async create(companyId: string, input: CreateEstimateInput) {
    return this.prisma.estimate.create({
      data: { ...input, companyId },
      include: { lines: true, sections: true },
    });
  }

  async addLine(companyId: string, estimateId: string, input: CreateEstimateLineInput) {
    await this.findOrThrow(companyId, estimateId);
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

    const rateItemIds = [...new Set(estimate.lines.map((l) => l.rateCatalogItemId))];
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
    const materials = await this.prisma.materialCatalogItem.findMany({ where: { id: { in: materialIds } } });
    const materialPricesById: Record<string, MaterialPrice> = Object.fromEntries(
      materials.map((m) => [m.id, { unitPrice: Number(m.defaultUnitPrice), unit: m.unit }]),
    );

    const result = calculateEstimate(
      estimate.lines.map((l) => ({ id: l.id, rateCatalogItemId: l.rateCatalogItemId, quantity: Number(l.quantity) })),
      rateItemsById,
      materialPricesById,
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

  /** Locks the estimate and snapshots the auto-generated material requirement list. */
  async approve(companyId: string, estimateId: string) {
    const estimate = await this.recalculate(companyId, estimateId);

    const rateItemIds = [...new Set(estimate.lines.map((l) => l.rateCatalogItemId))];
    const rateItems = await this.prisma.rateCatalogItem.findMany({
      where: { id: { in: rateItemIds } },
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
    const materials = await this.prisma.materialCatalogItem.findMany({ where: { id: { in: materialIds } } });
    const materialPricesById: Record<string, MaterialPrice> = Object.fromEntries(
      materials.map((m) => [m.id, { unitPrice: Number(m.defaultUnitPrice), unit: m.unit }]),
    );

    const result = calculateEstimate(
      estimate.lines.map((l) => ({ id: l.id, rateCatalogItemId: l.rateCatalogItemId, quantity: Number(l.quantity) })),
      rateItemsById,
      materialPricesById,
      {
        laborRatePerHour: Number(estimate.laborRatePerHour),
        markupPercent: Number(estimate.markupPercent),
        taxPercent: Number(estimate.taxPercent),
      },
    );

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
      this.prisma.estimate.update({ where: { id: estimateId }, data: { status: "approved" } }),
    ]);

    return this.findOrThrow(companyId, estimateId);
  }

  async generatePdf(companyId: string, estimateId: string): Promise<Buffer> {
    const estimate = await this.findOrThrow(companyId, estimateId);
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    const rateItems = await this.prisma.rateCatalogItem.findMany({
      where: { id: { in: estimate.lines.map((l) => l.rateCatalogItemId) } },
    });
    const rateItemsById = Object.fromEntries(rateItems.map((ri) => [ri.id, ri]));

    return this.pdfService.render({
      title: `Estimate — ${estimate.name}`,
      subtitle: estimate.project.name,
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
    });
  }

  private async findOrThrow(companyId: string, id: string) {
    const estimate = await this.prisma.estimate.findFirst({
      where: { id, companyId },
      include: {
        lines: { orderBy: { sortOrder: "asc" } },
        sections: { orderBy: { sortOrder: "asc" } },
        requirements: { include: { materialCatalogItem: true } },
        project: true,
      },
    });
    if (!estimate) throw new NotFoundException("Estimate not found");
    return estimate;
  }
}
