import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { UpdateMemberRoleInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(companyId: string) {
    return this.prisma.membership.findMany({
      where: { companyId },
      include: { user: { select: { id: true, email: true, name: true } } },
      orderBy: { createdAt: "asc" },
    });
  }

  async updateRole(companyId: string, actor: AuditActor, userId: string, input: UpdateMemberRoleInput) {
    const membership = await this.findOrThrow(companyId, userId);
    if (membership.role === "owner") {
      throw new BadRequestException("The owner's role can't be changed here — ownership transfer isn't supported yet");
    }
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

  async remove(companyId: string, actor: AuditActor, userId: string) {
    const membership = await this.findOrThrow(companyId, userId);
    if (membership.role === "owner") {
      throw new BadRequestException("The owner can't be removed from their own company");
    }
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
