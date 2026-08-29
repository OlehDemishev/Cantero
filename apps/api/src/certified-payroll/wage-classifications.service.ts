import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreateWageClassificationInput, UpdateWageClassificationInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";

@Injectable()
export class WageClassificationsService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string) {
    return this.prisma.wageClassification.findMany({ where: { companyId }, orderBy: { trade: "asc" } });
  }

  create(companyId: string, input: CreateWageClassificationInput) {
    return this.prisma.wageClassification.create({ data: { companyId, ...input } });
  }

  async update(companyId: string, id: string, input: UpdateWageClassificationInput) {
    await this.findOrThrow(companyId, id);
    return this.prisma.wageClassification.update({ where: { id }, data: input });
  }

  async delete(companyId: string, id: string) {
    await this.findOrThrow(companyId, id);
    // Workers tagged with this classification fall back to unclassified (onDelete: SetNull) rather than blocking deletion.
    await this.prisma.wageClassification.delete({ where: { id } });
    return { ok: true };
  }

  private async findOrThrow(companyId: string, id: string) {
    const classification = await this.prisma.wageClassification.findFirst({ where: { id, companyId } });
    if (!classification) throw new NotFoundException("Wage classification not found");
    return classification;
  }
}
