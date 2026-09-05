import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreatePurchaseOrderInput, ReceiveShipmentInput, ResolveReceivingDiscrepancyInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { StockService } from "./stock.service";
import { classifyReceivingLine } from "./receiving-discrepancy";

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stockService: StockService,
    private readonly audit: AuditService,
  ) {}

  list(companyId: string) {
    return this.prisma.purchaseOrder.findMany({
      where: { companyId },
      include: { supplier: true, lines: { include: { materialCatalogItem: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async get(companyId: string, id: string) {
    const po = await this.findOrThrow(companyId, id);
    return po;
  }

  async create(companyId: string, input: CreatePurchaseOrderInput) {
    const supplier = await this.prisma.supplier.findFirst({ where: { id: input.supplierId, companyId } });
    if (!supplier) throw new NotFoundException("Supplier not found");

    if (input.lines.length > 0) {
      const materialIds = [...new Set(input.lines.map((l) => l.materialCatalogItemId))];
      const owned = await this.prisma.materialCatalogItem.count({ where: { id: { in: materialIds }, companyId } });
      if (owned !== materialIds.length) throw new BadRequestException("One or more materials do not belong to this company");
    }

    return this.prisma.purchaseOrder.create({
      data: {
        companyId,
        supplierId: input.supplierId,
        status: "ordered",
        expectedDate: input.expectedDate ? new Date(input.expectedDate) : undefined,
        lines: {
          create: input.lines.map((l) => ({
            materialCatalogItemId: l.materialCatalogItemId,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
          })),
        },
      },
      include: { lines: true, supplier: true },
    });
  }

  /** Receiving a PO creates a `receipt` stock movement per line, crediting the warehouse. */
  async receive(companyId: string, id: string, warehouseId: string) {
    const po = await this.findOrThrow(companyId, id);
    if (po.status === "received") {
      throw new BadRequestException("Purchase order already received");
    }

    for (const line of po.lines) {
      await this.stockService.recordMovement(companyId, {
        warehouseId,
        materialCatalogItemId: line.materialCatalogItemId,
        type: "receipt",
        quantity: Number(line.quantity),
      });
    }

    return this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: "received", receivedAt: new Date() },
      include: { lines: true, supplier: true },
    });
  }

  /**
   * The granular counterpart to receive() above — supports partial shipments (a line's
   * quantityReceived accumulates across multiple calls) and flags discrepancies automatically
   * (over-ship, damaged) or from the receiver's own judgment (short-ship vs. backorder — see
   * classifyReceivingLine). Only the good (non-damaged) quantity becomes a stock receipt; damaged
   * goods are logged as a discrepancy but never enter usable inventory.
   */
  async receiveShipment(companyId: string, actor: AuditActor, id: string, input: ReceiveShipmentInput) {
    const po = await this.findOrThrow(companyId, id);
    if (po.status === "received") throw new BadRequestException("Purchase order already fully received");

    const lineById = new Map(po.lines.map((l) => [l.id, l]));
    for (const inputLine of input.lines) {
      if (!lineById.has(inputLine.lineId)) throw new BadRequestException("One or more lines do not belong to this purchase order");
    }

    for (const inputLine of input.lines) {
      const line = lineById.get(inputLine.lineId)!;
      const quantityDamaged = inputLine.quantityDamaged ?? 0;
      if (quantityDamaged > inputLine.quantityReceived) throw new BadRequestException("Damaged quantity can't exceed received quantity");

      const goodQuantity = inputLine.quantityReceived - quantityDamaged;
      if (goodQuantity > 0) {
        await this.stockService.recordMovement(companyId, {
          warehouseId: input.warehouseId,
          materialCatalogItemId: line.materialCatalogItemId,
          type: "receipt",
          quantity: goodQuantity,
        });
      }

      const discrepancies = classifyReceivingLine({
        orderedQuantity: Number(line.quantity),
        previouslyReceived: Number(line.quantityReceived),
        thisPassReceived: inputLine.quantityReceived,
        thisPassDamaged: quantityDamaged,
        shortfallType: inputLine.shortfallType,
      });
      for (const d of discrepancies) {
        const discrepancy = await this.prisma.receivingDiscrepancy.create({
          data: { companyId, purchaseOrderId: id, purchaseOrderLineId: line.id, type: d.type, quantity: d.quantity },
        });
        this.audit.record(companyId, actor, "receiving_discrepancy.flagged", "ReceivingDiscrepancy", discrepancy.id, `Flagged a ${d.type} discrepancy of ${d.quantity} on PO ${id}`);
      }

      await this.prisma.purchaseOrderLine.update({
        where: { id: line.id },
        data: { quantityReceived: { increment: inputLine.quantityReceived } },
      });
    }

    const updatedLines = await this.prisma.purchaseOrderLine.findMany({ where: { purchaseOrderId: id } });
    const fullyReceived = updatedLines.every((l) => Number(l.quantityReceived) >= Number(l.quantity));
    const anyReceived = updatedLines.some((l) => Number(l.quantityReceived) > 0);

    const updated = await this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: fullyReceived ? "received" : anyReceived ? "partially_received" : po.status,
        receivedAt: fullyReceived ? new Date() : undefined,
      },
      include: { lines: { include: { materialCatalogItem: true } }, supplier: true },
    });
    this.audit.record(companyId, actor, "purchase_order.shipment_received", "PurchaseOrder", id, `Logged a receiving pass on PO ${id}`);
    return updated;
  }

  listDiscrepancies(companyId: string, poId?: string) {
    return this.prisma.receivingDiscrepancy.findMany({
      where: { companyId, purchaseOrderId: poId },
      include: {
        purchaseOrder: { include: { supplier: { select: { id: true, name: true } } } },
        purchaseOrderLine: { include: { materialCatalogItem: { select: { id: true, code: true, name: true } } } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async resolveDiscrepancy(companyId: string, actor: AuditActor, id: string, input: ResolveReceivingDiscrepancyInput) {
    const discrepancy = await this.prisma.receivingDiscrepancy.findFirst({ where: { id, companyId } });
    if (!discrepancy) throw new NotFoundException("Receiving discrepancy not found");
    const updated = await this.prisma.receivingDiscrepancy.update({
      where: { id },
      data: { resolution: input.resolution, resolutionNotes: input.resolutionNotes },
    });
    this.audit.record(companyId, actor, "receiving_discrepancy.resolved", "ReceivingDiscrepancy", id, `Resolved discrepancy as ${input.resolution}`);
    return updated;
  }

  private async findOrThrow(companyId: string, id: string) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, companyId },
      include: { lines: { include: { materialCatalogItem: true } }, supplier: true },
    });
    if (!po) throw new NotFoundException("Purchase order not found");
    return po;
  }
}
