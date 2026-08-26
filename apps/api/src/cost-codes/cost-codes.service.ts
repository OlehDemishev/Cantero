import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateCostCodeInput, UpdateCostCodeInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";

@Injectable()
export class CostCodesService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string) {
    return this.prisma.costCode.findMany({ where: { companyId }, orderBy: { code: "asc" } });
  }

  async create(companyId: string, input: CreateCostCodeInput) {
    const existing = await this.prisma.costCode.findUnique({ where: { companyId_code: { companyId, code: input.code } } });
    if (existing) throw new BadRequestException(`A cost code "${input.code}" already exists`);
    return this.prisma.costCode.create({ data: { companyId, ...input } });
  }

  async update(companyId: string, id: string, input: UpdateCostCodeInput) {
    await this.findOrThrow(companyId, id);
    return this.prisma.costCode.update({ where: { id }, data: input });
  }

  async delete(companyId: string, id: string) {
    await this.findOrThrow(companyId, id);
    // Lines referencing this cost code fall back to uncategorized (onDelete: SetNull) rather than blocking deletion.
    await this.prisma.costCode.delete({ where: { id } });
    return { ok: true };
  }

  private async findOrThrow(companyId: string, id: string) {
    const costCode = await this.prisma.costCode.findFirst({ where: { id, companyId } });
    if (!costCode) throw new NotFoundException("Cost code not found");
    return costCode;
  }
}
