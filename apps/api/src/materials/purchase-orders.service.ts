import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreatePurchaseOrderInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { StockService } from "./stock.service";

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stockService: StockService,
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

  private async findOrThrow(companyId: string, id: string) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, companyId },
      include: { lines: { include: { materialCatalogItem: true } }, supplier: true },
    });
    if (!po) throw new NotFoundException("Purchase order not found");
    return po;
  }
}
