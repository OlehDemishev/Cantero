import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateCustomRoleInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";

@Injectable()
export class CustomRolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(companyId: string) {
    return this.prisma.customRole.findMany({
      where: { companyId },
      include: { _count: { select: { memberships: true } } },
      orderBy: { name: "asc" },
    });
  }

  async create(companyId: string, actor: AuditActor, input: CreateCustomRoleInput) {
    try {
      const role = await this.prisma.customRole.create({
        data: { companyId, name: input.name, basePermissions: input.basePermissions, extraPermissions: input.extraPermissions ?? [] },
      });
      this.audit.record(
        companyId,
        actor,
        "custom_role.created",
        "CustomRole",
        role.id,
        `Created custom role "${role.name}" (${[...input.basePermissions, ...(input.extraPermissions ?? [])].join(", ")})`,
      );
      return role;
    } catch (err) {
      if ((err as { code?: string }).code === "P2002") {
        throw new BadRequestException(`A custom role named "${input.name}" already exists`);
      }
      throw err;
    }
  }

  async delete(companyId: string, actor: AuditActor, id: string) {
    const role = await this.prisma.customRole.findFirst({ where: { id, companyId } });
    if (!role) throw new NotFoundException("Custom role not found");

    // Members holding this role fall back to their own base role (no schema change needed —
    // customRoleId just goes null via the FK's onDelete: SetNull).
    await this.prisma.customRole.delete({ where: { id } });
    this.audit.record(companyId, actor, "custom_role.deleted", "CustomRole", id, `Deleted custom role "${role.name}"`);
    return { ok: true };
  }
}
