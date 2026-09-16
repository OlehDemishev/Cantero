import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateSupplierReturnInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { runSerializable } from "../common/prisma/serializable-transaction";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { StockService } from "./stock.service";

const SUPPLIER_RETURN_INCLUDE = {
  supplier: { select: { id: true, name: true } },
  purchaseOrder: { select: { id: true } },
  warehouse: { select: { id: true, name: true } },
  lines: { include: { materialCatalogItem: { select: { id: true, code: true, name: true, unit: true } } } },
} as const;

/**
 * Tracks goods physically going back to a supplier as a document with a status lifecycle, the
 * same shape StockTransfer already uses for warehouse-to-warehouse moves — draft has no stock
 * effect, send() debits the warehouse via one write_off StockMovement per line, confirm() is a
 * bookkeeping-only transition once the supplier has acknowledged/credited the return.
 */
@Injectable()
export class SupplierReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stockService: StockService,
    private readonly audit: AuditService,
  ) {}

  list(companyId: string, supplierId: string | undefined, warehouseId: string | undefined, cursor?: string) {
    return this.prisma.supplierReturn.findMany({
      where: { companyId, ...(supplierId ? { supplierId } : {}), ...(warehouseId ? { warehouseId } : {}) },
      include: SUPPLIER_RETURN_INCLUDE,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
  }

  async get(companyId: string, id: string) {
    const supplierReturn = await this.prisma.supplierReturn.findFirst({ where: { id, companyId }, include: SUPPLIER_RETURN_INCLUDE });
    if (!supplierReturn) throw new NotFoundException("Supplier return not found");
    return supplierReturn;
  }

  async create(companyId: string, actor: AuditActor, input: CreateSupplierReturnInput) {
    const [supplier, purchaseOrder, warehouse] = await Promise.all([
      this.prisma.supplier.findFirst({ where: { id: input.supplierId, companyId } }),
      this.prisma.purchaseOrder.findFirst({ where: { id: input.purchaseOrderId, companyId } }),
      this.prisma.warehouse.findFirst({ where: { id: input.warehouseId, companyId } }),
    ]);
    if (!supplier) throw new NotFoundException("Supplier not found");
    if (!purchaseOrder) throw new NotFoundException("Purchase order not found");
    if (purchaseOrder.supplierId !== input.supplierId) throw new BadRequestException("This purchase order doesn't belong to the given supplier");
    if (!warehouse) throw new NotFoundException("Warehouse not found");

    const materialIds = [...new Set(input.lines.map((l) => l.materialCatalogItemId))];
    const owned = await this.prisma.materialCatalogItem.count({ where: { id: { in: materialIds }, companyId } });
    if (owned !== materialIds.length) throw new BadRequestException("One or more materials do not belong to this company");

    const created = await this.prisma.supplierReturn.create({
      data: {
        companyId,
        supplierId: input.supplierId,
        purchaseOrderId: input.purchaseOrderId,
        warehouseId: input.warehouseId,
        reason: input.reason,
        notes: input.notes,
        createdByName: actor.name,
        lines: { create: input.lines.map((l) => ({ materialCatalogItemId: l.materialCatalogItemId, quantity: l.quantity })) },
      },
      include: SUPPLIER_RETURN_INCLUDE,
    });
    this.audit.record(companyId, actor, "supplier_return.created", "SupplierReturn", created.id, `Created a return to "${supplier.name}"`);
    return created;
  }

  /**
   * The read-check-write sequence (status check + one write_off movement per line) runs inside a
   * single serializable transaction so two concurrent sends of the same return can't both pass the
   * draft-status check and double-debit the warehouse — same TOCTOU concern StockTransfer guards
   * against for receive()/cancel(). Deliberately does NOT call StockService.recordMovement()
   * (which opens its own top-level transaction and would break atomicity with this one) — instead
   * mirrors StockTransfersService.initiate()'s pattern of calling the composable
   * computeSingleWarehouseCosting(tx, ...) and writing the StockMovement/StockLevel rows directly
   * against the same `tx`. Like StockTransfer, this doesn't handle lot/serial-tracked materials —
   * an existing gap in that document-flow pattern, not one introduced here.
   */
  async send(companyId: string, actor: AuditActor, id: string) {
    const updated = await runSerializable(this.prisma, async (tx) => {
      const supplierReturn = await tx.supplierReturn.findFirst({ where: { id, companyId }, include: { lines: true } });
      if (!supplierReturn) throw new NotFoundException("Supplier return not found");
      if (supplierReturn.status !== "draft") throw new BadRequestException(`Supplier return is already ${supplierReturn.status}`);

      for (const line of supplierReturn.lines) {
        const costing = await this.stockService.computeSingleWarehouseCosting(
          tx,
          companyId,
          supplierReturn.warehouseId,
          line.materialCatalogItemId,
          "write_off",
          Number(line.quantity),
          undefined,
        );
        const movement = await tx.stockMovement.create({
          data: {
            companyId,
            warehouseId: supplierReturn.warehouseId,
            materialCatalogItemId: line.materialCatalogItemId,
            type: "write_off",
            quantity: line.quantity,
            unitCost: costing.movementUnitCost ?? undefined,
          },
        });
        await tx.stockLevel.upsert({
          where: {
            warehouseId_materialCatalogItemId: { warehouseId: supplierReturn.warehouseId, materialCatalogItemId: line.materialCatalogItemId },
          },
          create: { warehouseId: supplierReturn.warehouseId, materialCatalogItemId: line.materialCatalogItemId, quantityOnHand: -line.quantity },
          update: { quantityOnHand: { decrement: line.quantity } },
        });
        await tx.supplierReturnLine.update({ where: { id: line.id }, data: { stockMovementId: movement.id } });
      }

      return tx.supplierReturn.update({
        where: { id },
        data: { status: "sent", sentAt: new Date() },
        include: SUPPLIER_RETURN_INCLUDE,
      });
    });
    this.audit.record(companyId, actor, "supplier_return.sent", "SupplierReturn", id, `Sent supplier return to "${updated.supplier.name}"`);
    return updated;
  }

  async confirm(companyId: string, actor: AuditActor, id: string) {
    const supplierReturn = await this.prisma.supplierReturn.findFirst({ where: { id, companyId } });
    if (!supplierReturn) throw new NotFoundException("Supplier return not found");
    if (supplierReturn.status !== "sent") throw new BadRequestException(`Supplier return must be sent before it can be confirmed`);

    const updated = await this.prisma.supplierReturn.update({
      where: { id },
      data: { status: "confirmed", confirmedAt: new Date() },
      include: SUPPLIER_RETURN_INCLUDE,
    });
    this.audit.record(companyId, actor, "supplier_return.confirmed", "SupplierReturn", id, `Confirmed supplier return to "${updated.supplier.name}"`);
    return updated;
  }
}
