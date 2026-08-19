import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreateRateCatalogItemInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";

@Injectable()
export class RateCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string) {
    return this.prisma.rateCatalogItem.findMany({
      where: { companyId },
      include: { materials: { include: { materialCatalogItem: true } } },
      orderBy: { code: "asc" },
    });
  }

  async get(companyId: string, id: string) {
    const item = await this.prisma.rateCatalogItem.findFirst({
      where: { id, companyId },
      include: { materials: { include: { materialCatalogItem: true } } },
    });
    if (!item) throw new NotFoundException("Rate catalog item not found");
    return item;
  }

  create(companyId: string, input: CreateRateCatalogItemInput) {
    return this.prisma.rateCatalogItem.create({
      data: {
        companyId,
        code: input.code,
        name: input.name,
        unit: input.unit,
        laborHoursPerUnit: input.laborHoursPerUnit,
        materials: {
          create: input.materials.map((m) => ({
            materialCatalogItemId: m.materialCatalogItemId,
            quantityPerUnit: m.quantityPerUnit,
            wasteFactorPercent: m.wasteFactorPercent,
          })),
        },
      },
      include: { materials: true },
    });
  }
}
