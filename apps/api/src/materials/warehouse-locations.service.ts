import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateWarehouseLocationInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";

@Injectable()
export class WarehouseLocationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** The full flat node list for one warehouse — small per-warehouse N, so the frontend builds the
   * nested tree view from this (via parentId) rather than a recursive CTE here. */
  async list(companyId: string, warehouseId: string) {
    const warehouse = await this.prisma.warehouse.findFirst({ where: { id: warehouseId, companyId } });
    if (!warehouse) throw new NotFoundException("Warehouse not found");

    return this.prisma.warehouseLocation.findMany({
      where: { warehouseId },
      orderBy: [{ kind: "asc" }, { code: "asc" }],
    });
  }

  async create(companyId: string, input: CreateWarehouseLocationInput) {
    const warehouse = await this.prisma.warehouse.findFirst({ where: { id: input.warehouseId, companyId } });
    if (!warehouse) throw new NotFoundException("Warehouse not found");

    if (input.parentId) {
      const parent = await this.prisma.warehouseLocation.findFirst({ where: { id: input.parentId, companyId } });
      if (!parent) throw new NotFoundException("Parent location not found");
      // Cross-warehouse parenting is a bug class worth a named check, not just a dangling FK a
      // careless client could otherwise create (both ids are valid, just for different warehouses).
      if (parent.warehouseId !== input.warehouseId) {
        throw new BadRequestException("Parent location must belong to the same warehouse");
      }
    }

    return this.prisma.warehouseLocation.create({
      data: { companyId, warehouseId: input.warehouseId, parentId: input.parentId, kind: input.kind, code: input.code },
    });
  }

  /** Never cascade-deletes inventory location data silently — a node with children or with
   * StockLevel rows still pointing at it must be cleared out explicitly first. */
  async delete(companyId: string, id: string) {
    const location = await this.prisma.warehouseLocation.findFirst({ where: { id, companyId } });
    if (!location) throw new NotFoundException("Location not found");

    const [childCount, stockLevelCount] = await Promise.all([
      this.prisma.warehouseLocation.count({ where: { parentId: id } }),
      this.prisma.stockLevel.count({ where: { binLocationId: id } }),
    ]);
    if (childCount > 0) throw new BadRequestException("This location has child locations");
    if (stockLevelCount > 0) throw new BadRequestException("This location is assigned to one or more stock levels");

    await this.prisma.warehouseLocation.delete({ where: { id } });
    return { ok: true };
  }
}
