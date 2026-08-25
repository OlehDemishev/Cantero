import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateAssemblyInput, UpdateAssemblyInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";

@Injectable()
export class AssembliesService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string) {
    return this.prisma.assembly.findMany({
      where: { companyId },
      include: { items: { include: { rateCatalogItem: true } } },
      orderBy: { name: "asc" },
    });
  }

  async get(companyId: string, id: string) {
    const assembly = await this.prisma.assembly.findFirst({
      where: { id, companyId },
      include: { items: { include: { rateCatalogItem: true } } },
    });
    if (!assembly) throw new NotFoundException("Assembly not found");
    return assembly;
  }

  async create(companyId: string, input: CreateAssemblyInput) {
    await this.assertRateItemsBelong(companyId, input.items.map((i) => i.rateCatalogItemId));
    try {
      return await this.prisma.assembly.create({
        data: {
          companyId,
          code: input.code,
          name: input.name,
          unit: input.unit,
          items: { create: input.items.map((i) => ({ rateCatalogItemId: i.rateCatalogItemId, quantityPerUnit: i.quantityPerUnit })) },
        },
        include: { items: { include: { rateCatalogItem: true } } },
      });
    } catch (err) {
      if ((err as { code?: string }).code === "P2002") {
        throw new BadRequestException(`An assembly with code "${input.code}" already exists`);
      }
      throw err;
    }
  }

  async update(companyId: string, id: string, input: UpdateAssemblyInput) {
    await this.get(companyId, id);
    if (input.items) await this.assertRateItemsBelong(companyId, input.items.map((i) => i.rateCatalogItemId));

    return this.prisma.$transaction(async (tx) => {
      if (input.items) {
        await tx.assemblyItem.deleteMany({ where: { assemblyId: id } });
        await tx.assemblyItem.createMany({
          data: input.items.map((i) => ({ assemblyId: id, rateCatalogItemId: i.rateCatalogItemId, quantityPerUnit: i.quantityPerUnit })),
        });
      }
      return tx.assembly.update({
        where: { id },
        data: { name: input.name, unit: input.unit },
        include: { items: { include: { rateCatalogItem: true } } },
      });
    });
  }

  async delete(companyId: string, id: string) {
    await this.get(companyId, id);
    await this.prisma.assembly.delete({ where: { id } });
    return { ok: true };
  }

  private async assertRateItemsBelong(companyId: string, ids: string[]): Promise<void> {
    const count = await this.prisma.rateCatalogItem.count({ where: { id: { in: ids }, companyId } });
    if (count !== new Set(ids).size) throw new BadRequestException("One or more rate items don't belong to this company");
  }
}
