import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { CSI_MASTERFORMAT_DIVISIONS, type CreateCostCodeInput, type UpdateCostCodeInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";

@Injectable()
export class CostCodesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(companyId: string) {
    return this.prisma.costCode.findMany({ where: { companyId }, orderBy: { code: "asc" } });
  }

  /** Bulk-creates the standard 16-division CSI MasterFormat structure, skipping any division code
   * the company already has — same "skip what's already there" convention as the material CSV
   * importer, so re-running this is always safe. */
  async importStandardLibrary(companyId: string, actor: AuditActor) {
    const existing = await this.prisma.costCode.findMany({ where: { companyId }, select: { code: true } });
    const existingCodes = new Set(existing.map((c) => c.code));
    const toCreate = CSI_MASTERFORMAT_DIVISIONS.filter((d) => !existingCodes.has(d.code));

    if (toCreate.length > 0) {
      await this.prisma.costCode.createMany({ data: toCreate.map((d) => ({ companyId, code: d.code, name: d.name })) });
    }

    this.audit.record(
      companyId,
      actor,
      "cost_codes.imported_standard_library",
      "Company",
      companyId,
      `Imported ${toCreate.length} CSI MasterFormat division(s) (${existing.length > 0 ? CSI_MASTERFORMAT_DIVISIONS.length - toCreate.length : 0} already present)`,
    );
    return { created: toCreate.length, skipped: CSI_MASTERFORMAT_DIVISIONS.length - toCreate.length };
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
