import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreateMaterialCatalogItemInput, UpdateMaterialReorderInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";

@Injectable()
export class MaterialCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string) {
    return this.prisma.materialCatalogItem.findMany({
      where: { companyId },
      include: { preferredSupplier: true },
      orderBy: { code: "asc" },
    });
  }

  async get(companyId: string, id: string) {
    const item = await this.prisma.materialCatalogItem.findFirst({
      where: { id, companyId },
      include: { preferredSupplier: true },
    });
    if (!item) throw new NotFoundException("Material catalog item not found");
    return item;
  }

  create(companyId: string, input: CreateMaterialCatalogItemInput) {
    return this.prisma.materialCatalogItem.create({
      data: { ...input, companyId },
    });
  }

  async updateReorderSettings(companyId: string, id: string, input: UpdateMaterialReorderInput) {
    await this.get(companyId, id);
    if (input.preferredSupplierId) {
      const supplier = await this.prisma.supplier.findFirst({ where: { id: input.preferredSupplierId, companyId } });
      if (!supplier) throw new NotFoundException("Supplier not found");
    }
    return this.prisma.materialCatalogItem.update({
      where: { id },
      data: input,
      include: { preferredSupplier: true },
    });
  }
}
