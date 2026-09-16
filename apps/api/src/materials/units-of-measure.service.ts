import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateUnitOfMeasureInput, UpdateUnitOfMeasureInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";

@Injectable()
export class UnitsOfMeasureService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string) {
    return this.prisma.unitOfMeasure.findMany({
      where: { companyId },
      orderBy: [{ baseUnitId: "asc" }, { code: "asc" }],
    });
  }

  async get(companyId: string, id: string) {
    const unit = await this.prisma.unitOfMeasure.findFirst({ where: { id, companyId } });
    if (!unit) throw new NotFoundException("Unit of measure not found");
    return unit;
  }

  /**
   * A derived unit can only point at a base unit (baseUnitId itself null) — chaining a derived
   * unit off another derived one would make conversion a graph-traversal problem instead of the
   * single multiply/divide convertUnitQuantity relies on. See unit-conversion.ts.
   */
  async create(companyId: string, input: CreateUnitOfMeasureInput) {
    if (input.baseUnitId) {
      const baseUnit = await this.prisma.unitOfMeasure.findFirst({ where: { id: input.baseUnitId, companyId } });
      if (!baseUnit) throw new NotFoundException("Base unit not found");
      if (baseUnit.baseUnitId !== null) throw new BadRequestException("A unit can't be derived from another derived unit");
    }

    return this.prisma.unitOfMeasure.create({
      data: {
        companyId,
        code: input.code,
        name: input.name,
        baseUnitId: input.baseUnitId,
        factorToBase: input.factorToBase,
      },
    });
  }

  async update(companyId: string, id: string, input: UpdateUnitOfMeasureInput) {
    await this.get(companyId, id);
    return this.prisma.unitOfMeasure.update({ where: { id }, data: { name: input.name } });
  }

  /** Refuses to delete a unit still referenced by any material or acting as another unit's base —
   * silently cascading either would leave items pointing at nothing or strand a conversion family. */
  async delete(companyId: string, id: string) {
    await this.get(companyId, id);

    const [materialCount, derivedCount] = await Promise.all([
      this.prisma.materialCatalogItem.count({ where: { OR: [{ unitId: id }, { purchaseUnitId: id }] } }),
      this.prisma.unitOfMeasure.count({ where: { baseUnitId: id } }),
    ]);
    if (materialCount > 0) throw new BadRequestException("This unit is used by one or more materials");
    if (derivedCount > 0) throw new BadRequestException("This unit is the base for one or more other units");

    await this.prisma.unitOfMeasure.delete({ where: { id } });
    return { ok: true };
  }
}
