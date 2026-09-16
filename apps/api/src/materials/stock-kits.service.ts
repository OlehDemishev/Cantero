import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { CreateStockKitInput, UpdateStockKitInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { runSerializable } from "../common/prisma/serializable-transaction";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { StockService } from "./stock.service";

const STOCK_KIT_INCLUDE = {
  kitMaterialCatalogItem: { select: { id: true, code: true, name: true, unit: true } },
  components: { include: { materialCatalogItem: { select: { id: true, code: true, name: true, unit: true } } } },
} as const;

@Injectable()
export class StockKitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stockService: StockService,
    private readonly audit: AuditService,
  ) {}

  list(companyId: string) {
    return this.prisma.stockKit.findMany({ where: { companyId }, include: STOCK_KIT_INCLUDE, orderBy: { name: "asc" } });
  }

  async get(companyId: string, id: string) {
    const kit = await this.prisma.stockKit.findFirst({ where: { id, companyId }, include: STOCK_KIT_INCLUDE });
    if (!kit) throw new NotFoundException("Stock kit not found");
    return kit;
  }

  private async validateComponents(companyId: string, kitMaterialCatalogItemId: string, components: { materialCatalogItemId: string }[]) {
    if (components.some((c) => c.materialCatalogItemId === kitMaterialCatalogItemId)) {
      throw new BadRequestException("A kit can't list its own finished item as a component");
    }
    const ids = components.map((c) => c.materialCatalogItemId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException("Duplicate component material in the same kit");

    const owned = await this.prisma.materialCatalogItem.count({ where: { id: { in: ids }, companyId } });
    if (owned !== ids.length) throw new BadRequestException("One or more components do not belong to this company");
  }

  async create(companyId: string, actor: AuditActor, input: CreateStockKitInput) {
    const kitMaterial = await this.prisma.materialCatalogItem.findFirst({ where: { id: input.kitMaterialCatalogItemId, companyId } });
    if (!kitMaterial) throw new NotFoundException("Material not found");
    await this.validateComponents(companyId, input.kitMaterialCatalogItemId, input.components);

    const created = await this.prisma.stockKit.create({
      data: {
        companyId,
        kitMaterialCatalogItemId: input.kitMaterialCatalogItemId,
        name: input.name,
        components: { create: input.components.map((c) => ({ materialCatalogItemId: c.materialCatalogItemId, quantityPerKit: c.quantityPerKit })) },
      },
      include: STOCK_KIT_INCLUDE,
    });
    this.audit.record(companyId, actor, "stock_kit.created", "StockKit", created.id, `Created kit "${input.name}"`);
    return created;
  }

  /** Replaces the component list wholesale when given, same pattern AssembliesService.update
   * already uses for its own line items — simpler than diffing individual component rows. */
  async update(companyId: string, actor: AuditActor, id: string, input: UpdateStockKitInput) {
    const kit = await this.get(companyId, id);
    if (input.components) {
      await this.validateComponents(companyId, kit.kitMaterialCatalogItemId, input.components);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (input.components) {
        await tx.stockKitComponent.deleteMany({ where: { stockKitId: id } });
        await tx.stockKitComponent.createMany({
          data: input.components.map((c) => ({ stockKitId: id, materialCatalogItemId: c.materialCatalogItemId, quantityPerKit: c.quantityPerKit })),
        });
      }
      return tx.stockKit.update({
        where: { id },
        data: { name: input.name },
        include: STOCK_KIT_INCLUDE,
      });
    });
    this.audit.record(companyId, actor, "stock_kit.updated", "StockKit", id, `Updated kit "${updated.name}"`);
    return updated;
  }

  async delete(companyId: string, actor: AuditActor, id: string) {
    const kit = await this.get(companyId, id);
    await this.prisma.stockKit.delete({ where: { id } });
    this.audit.record(companyId, actor, "stock_kit.deleted", "StockKit", id, `Deleted kit "${kit.name}"`);
    return { ok: true };
  }

  /**
   * Consumes `quantity` kits' worth of every component at `warehouseId` and receives `quantity` of
   * the finished kit item — all inside one serializable transaction. Deliberately does NOT call
   * StockService.recordMovement() (which opens its own top-level transaction and would break
   * atomicity here) — instead calls the composable computeSingleWarehouseCosting(tx, ...) per
   * component/receipt and writes the StockMovement/StockLevel rows directly against the shared
   * `tx`, the same pattern SupplierReturnsService.send() and StockTransfersService already use.
   * Non-blocking on component shortfall, matching issueFromEstimate's philosophy: this issues what
   * it can rather than refusing the whole assembly outright.
   *
   * Costing: the finished kit's receipt unitCost is the sum of each component's actual costed
   * issue unit cost × its ratio — makes kit assembly self-consistent with whichever costing method
   * (FIFO/weighted-average) the company already uses, with zero new costing logic of its own.
   */
  async assemble(companyId: string, actor: AuditActor, warehouseId: string, kitId: string, quantity: number) {
    const updated = await runSerializable(this.prisma, async (tx) => {
      const kit = await this.loadKitForOperation(tx, companyId, warehouseId, kitId);

      let totalComponentCost = 0;
      for (const component of kit.components) {
        const componentQuantity = Number(component.quantityPerKit) * quantity;
        const costing = await this.stockService.computeSingleWarehouseCosting(
          tx,
          companyId,
          warehouseId,
          component.materialCatalogItemId,
          "issue",
          componentQuantity,
          undefined,
        );
        await this.writeMovement(tx, companyId, warehouseId, component.materialCatalogItemId, "issue", componentQuantity, costing.movementUnitCost);
        if (costing.movementUnitCost != null) totalComponentCost += costing.movementUnitCost * componentQuantity;
      }

      const kitUnitCost = totalComponentCost > 0 ? totalComponentCost / quantity : undefined;
      const kitCosting = await this.stockService.computeSingleWarehouseCosting(
        tx,
        companyId,
        warehouseId,
        kit.kitMaterialCatalogItemId,
        "receipt",
        quantity,
        kitUnitCost,
      );
      await this.writeMovement(tx, companyId, warehouseId, kit.kitMaterialCatalogItemId, "receipt", quantity, kitCosting.movementUnitCost, kitCosting.averageCostUpdate);

      return kit;
    });
    this.audit.record(companyId, actor, "stock_kit.assembled", "StockKit", kitId, `Assembled ${quantity} × "${updated.name}" at warehouse ${warehouseId}`);
    return { ok: true };
  }

  /** The inverse of assemble(): issues `quantity` of the finished kit item and receives back
   * `quantity` × each component's ratio — a literal teardown, e.g. reclaiming components from an
   * unused pre-built kit. The kit's own issue cost isn't distributed back to components (there's
   * no principled way to un-blend a receipt's average cost) — components come back at whatever
   * cost the receipt-with-no-unitCost default produces, same as any other uncosted receipt. */
  async disassemble(companyId: string, actor: AuditActor, warehouseId: string, kitId: string, quantity: number) {
    const updated = await runSerializable(this.prisma, async (tx) => {
      const kit = await this.loadKitForOperation(tx, companyId, warehouseId, kitId);

      const kitCosting = await this.stockService.computeSingleWarehouseCosting(
        tx,
        companyId,
        warehouseId,
        kit.kitMaterialCatalogItemId,
        "issue",
        quantity,
        undefined,
      );
      await this.writeMovement(tx, companyId, warehouseId, kit.kitMaterialCatalogItemId, "issue", quantity, kitCosting.movementUnitCost);

      for (const component of kit.components) {
        const componentQuantity = Number(component.quantityPerKit) * quantity;
        const costing = await this.stockService.computeSingleWarehouseCosting(
          tx,
          companyId,
          warehouseId,
          component.materialCatalogItemId,
          "receipt",
          componentQuantity,
          undefined,
        );
        await this.writeMovement(tx, companyId, warehouseId, component.materialCatalogItemId, "receipt", componentQuantity, costing.movementUnitCost, costing.averageCostUpdate);
      }

      return kit;
    });
    this.audit.record(companyId, actor, "stock_kit.disassembled", "StockKit", kitId, `Disassembled ${quantity} × "${updated.name}" at warehouse ${warehouseId}`);
    return { ok: true };
  }

  private async loadKitForOperation(tx: Prisma.TransactionClient, companyId: string, warehouseId: string, kitId: string) {
    const warehouse = await tx.warehouse.findFirst({ where: { id: warehouseId, companyId } });
    if (!warehouse) throw new NotFoundException("Warehouse not found");
    const kit = await tx.stockKit.findFirst({ where: { id: kitId, companyId }, include: { components: true } });
    if (!kit) throw new NotFoundException("Stock kit not found");
    return kit;
  }

  private async writeMovement(
    tx: Prisma.TransactionClient,
    companyId: string,
    warehouseId: string,
    materialCatalogItemId: string,
    type: "issue" | "receipt",
    quantity: number,
    unitCost: number | null,
    averageCostUpdate?: number | null,
  ) {
    await tx.stockMovement.create({
      data: { companyId, warehouseId, materialCatalogItemId, type, quantity, unitCost: unitCost ?? undefined },
    });
    const delta = type === "issue" ? -quantity : quantity;
    await tx.stockLevel.upsert({
      where: { warehouseId_materialCatalogItemId: { warehouseId, materialCatalogItemId } },
      create: { warehouseId, materialCatalogItemId, quantityOnHand: delta, averageCost: averageCostUpdate ?? undefined },
      update: { quantityOnHand: { increment: delta }, ...(averageCostUpdate != null ? { averageCost: averageCostUpdate } : {}) },
    });
  }
}
