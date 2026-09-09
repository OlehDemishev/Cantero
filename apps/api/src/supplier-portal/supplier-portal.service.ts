import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { AcknowledgePurchaseOrderInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { OutboxService } from "../common/webhooks/outbox.service";
import type { PortalSupplierContext } from "./supplier-portal-jwt.service";

@Injectable()
export class SupplierPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  async me(supplier: PortalSupplierContext) {
    const record = await this.prisma.supplier.findUniqueOrThrow({
      where: { id: supplier.supplierId },
      include: { company: { select: { name: true, currency: true } } },
    });
    return { name: record.name, email: record.email, companyName: record.company.name, currency: record.company.currency };
  }

  listPurchaseOrders(supplier: PortalSupplierContext) {
    return this.prisma.purchaseOrder.findMany({
      where: { supplierId: supplier.supplierId },
      include: { lines: { include: { materialCatalogItem: { select: { name: true, unit: true } } } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async getPurchaseOrder(supplier: PortalSupplierContext, id: string) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, supplierId: supplier.supplierId },
      include: { lines: { include: { materialCatalogItem: { select: { name: true, unit: true } } } } },
    });
    if (!po) throw new NotFoundException("Purchase order not found");
    return po;
  }

  /** A supplier confirms receipt of an order and optionally states their own delivery estimate —
   * independent of the internal draft/ordered/received status lifecycle (PurchaseOrdersService). */
  async acknowledge(supplier: PortalSupplierContext, id: string, input: AcknowledgePurchaseOrderInput) {
    const po = await this.prisma.purchaseOrder.findFirst({ where: { id, supplierId: supplier.supplierId } });
    if (!po) throw new NotFoundException("Purchase order not found");
    if (po.status === "draft") throw new BadRequestException("This order has not been placed yet");
    if (po.acknowledgedAt) throw new BadRequestException("This order has already been acknowledged");

    const updated = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.purchaseOrder.update({
        where: { id },
        data: {
          acknowledgedAt: new Date(),
          supplierEta: input.eta ? new Date(input.eta) : undefined,
          supplierNote: input.note,
        },
        include: { lines: { include: { materialCatalogItem: { select: { name: true, unit: true } } } } },
      });
      await this.outbox.enqueue(tx, supplier.companyId, "purchase_order.acknowledged", { purchaseOrderId: id });
      return updated;
    });
    return updated;
  }
}
