import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateCatalogInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";

@Injectable()
export class CatalogsService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string) {
    return this.prisma.catalog.findMany({ where: { companyId }, orderBy: { name: "asc" } });
  }

  async create(companyId: string, input: CreateCatalogInput) {
    const existing = await this.prisma.catalog.findFirst({ where: { companyId, name: input.name } });
    if (existing) throw new BadRequestException("A catalog with this name already exists");
    return this.prisma.catalog.create({ data: { companyId, name: input.name } });
  }

  /** Deleting a catalog un-assigns (not deletes) its rate items — RateCatalogItem.catalogId is
   * nullable specifically so this is a safe, non-destructive operation. */
  async delete(companyId: string, id: string) {
    const catalog = await this.prisma.catalog.findFirst({ where: { id, companyId } });
    if (!catalog) throw new NotFoundException("Catalog not found");
    await this.prisma.catalog.delete({ where: { id } });
  }
}
