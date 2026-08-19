import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreateMaterialCatalogItemInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";

@Injectable()
export class MaterialCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string) {
    return this.prisma.materialCatalogItem.findMany({
      where: { companyId },
      orderBy: { code: "asc" },
    });
  }

  async get(companyId: string, id: string) {
    const item = await this.prisma.materialCatalogItem.findFirst({ where: { id, companyId } });
    if (!item) throw new NotFoundException("Material catalog item not found");
    return item;
  }

  create(companyId: string, input: CreateMaterialCatalogItemInput) {
    return this.prisma.materialCatalogItem.create({
      data: { ...input, companyId },
    });
  }
}
