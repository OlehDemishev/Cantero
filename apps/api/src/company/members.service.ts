import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { AssignCustomRoleInput, UpdateMemberRoleInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { assertMayAppointAdmin } from "../common/permissions/admin-appointment";

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(companyId: string) {
    return this.prisma.membership.findMany({
      where: { companyId },
      include: { user: { select: { id: true, email: true, name: true } }, customRole: true },
      orderBy: { createdAt: "asc" },
    });
  }

  async updateRole(companyId: string, actor: AuditActor & { role?: string }, userId: string, input: UpdateMemberRoleInput) {
    const membership = await this.findOrThrow(companyId, userId);
    if (membership.role === "owner") {
      throw new BadRequestException("The owner's role can't be changed here — ownership transfer isn't supported yet");
    }
    assertMayAppointAdmin(actor.role, membership.role === "admin" || input.role === "admin");
    const updated = await this.prisma.membership.update({
      where: { id: membership.id },
      data: { role: input.role },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    this.audit.record(
      companyId,
      actor,
      "member.role_changed",
      "Membership",
      updated.userId,
      `Changed ${updated.user.name}'s role from ${membership.role} to ${input.role}`,
      { before: membership.role, after: input.role },
    );
    return updated;
  }

  async assignCustomRole(companyId: string, actor: AuditActor & { role?: string }, userId: string, input: AssignCustomRoleInput) {
    const membership = await this.findOrThrow(companyId, userId);

    let grantsAdmin = false;
    if (input.customRoleId) {
      const customRole = await this.prisma.customRole.findFirst({ where: { id: input.customRoleId, companyId } });
      if (!customRole) throw new NotFoundException("Custom role not found");
      grantsAdmin = customRole.basePermissions.includes("admin");
    }
    // Taking away an admin-based custom role unmakes an admin just as much as giving one makes one.
    const current = membership.customRoleId
      ? await this.prisma.customRole.findFirst({ where: { id: membership.customRoleId, companyId }, select: { basePermissions: true } })
      : null;
    assertMayAppointAdmin(actor.role, membership.role === "admin" || grantsAdmin || !!current?.basePermissions.includes("admin"));

    const updated = await this.prisma.membership.update({
      where: { id: membership.id },
      data: { customRoleId: input.customRoleId },
      include: { user: { select: { id: true, email: true, name: true } }, customRole: true },
    });
    this.audit.record(
      companyId,
      actor,
      "member.custom_role_assigned",
      "Membership",
      updated.userId,
      input.customRoleId
        ? `Assigned custom role "${updated.customRole?.name}" to ${updated.user.name}`
        : `Removed ${updated.user.name}'s custom role`,
    );
    return updated;
  }

  async remove(companyId: string, actor: AuditActor & { role?: string }, userId: string) {
    const membership = await this.findOrThrow(companyId, userId);
    if (membership.role === "owner") {
      throw new BadRequestException("The owner can't be removed from their own company");
    }
    assertMayAppointAdmin(actor.role, membership.role === "admin");
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    await this.prisma.membership.delete({ where: { id: membership.id } });
    this.audit.record(companyId, actor, "member.removed", "Membership", userId, `Removed ${user?.name ?? userId} from the company`);
    return { removed: true };
  }

  private async findOrThrow(companyId: string, userId: string) {
    const membership = await this.prisma.membership.findFirst({ where: { companyId, userId } });
    if (!membership) throw new NotFoundException("Member not found");
    return membership;
  }
}
