import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreateWarehouseInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";

@Injectable()
export class WarehousesService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string) {
    return this.prisma.warehouse.findMany({ where: { companyId }, orderBy: { name: "asc" } });
  }

  async get(companyId: string, id: string) {
    const warehouse = await this.prisma.warehouse.findFirst({ where: { id, companyId } });
    if (!warehouse) throw new NotFoundException("Warehouse not found");
    return warehouse;
  }

  create(companyId: string, input: CreateWarehouseInput) {
    return this.prisma.warehouse.create({ data: { ...input, companyId } });
  }
}
