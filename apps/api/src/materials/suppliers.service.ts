import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreateSupplierInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string) {
    return this.prisma.supplier.findMany({ where: { companyId }, orderBy: { name: "asc" } });
  }

  async get(companyId: string, id: string) {
    const supplier = await this.prisma.supplier.findFirst({ where: { id, companyId } });
    if (!supplier) throw new NotFoundException("Supplier not found");
    return supplier;
  }

  create(companyId: string, input: CreateSupplierInput) {
    return this.prisma.supplier.create({ data: { ...input, companyId } });
  }
}
