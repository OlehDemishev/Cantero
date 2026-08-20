import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateRateCatalogItemInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { metricMaterials, metricRateItems, imperialMaterials, imperialRateItems } from "./starter-catalog-data";

@Injectable()
export class RateCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

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

  async create(companyId: string, input: CreateRateCatalogItemInput) {
    if (input.materials.length > 0) {
      const materialIds = [...new Set(input.materials.map((m) => m.materialCatalogItemId))];
      const owned = await this.prisma.materialCatalogItem.count({ where: { id: { in: materialIds }, companyId } });
      if (owned !== materialIds.length) throw new BadRequestException("One or more materials do not belong to this company");
    }
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

  /** Loads the built-in starter catalog (metric or imperial, matching the company's unit system). No-op if the company already has any rate catalog items. */
  async seedStarter(companyId: string, actor: AuditActor) {
    const existingCount = await this.prisma.rateCatalogItem.count({ where: { companyId } });
    if (existingCount > 0) throw new BadRequestException("Rate catalog is not empty");

    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    const materials = company.unitSystem === "imperial" ? imperialMaterials : metricMaterials;
    const rateItems = company.unitSystem === "imperial" ? imperialRateItems : metricRateItems;

    const materialIdByCode = new Map<string, string>();
    for (const m of materials) {
      const created = await this.prisma.materialCatalogItem.create({
        data: { companyId, code: m.code, name: m.name, unit: m.unit, defaultUnitPrice: m.defaultUnitPrice },
      });
      materialIdByCode.set(m.code, created.id);
    }

    for (const ri of rateItems) {
      await this.prisma.rateCatalogItem.create({
        data: {
          companyId,
          code: ri.code,
          name: ri.name,
          unit: ri.unit,
          laborHoursPerUnit: ri.laborHoursPerUnit,
          materials: {
            create: ri.materials.map((m) => ({
              materialCatalogItemId: materialIdByCode.get(m.materialCode)!,
              quantityPerUnit: m.quantityPerUnit,
              wasteFactorPercent: m.wasteFactorPercent ?? 0,
            })),
          },
        },
      });
    }

    this.audit.record(
      companyId,
      actor,
      "rate_catalog.starter_seeded",
      "Company",
      companyId,
      `Loaded starter catalog: ${materials.length} materials, ${rateItems.length} rate items`,
    );

    return { materialsCreated: materials.length, rateItemsCreated: rateItems.length };
  }
}
