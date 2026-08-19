import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { UpdateMemberRoleInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";

@Injectable()
export class MembersService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string) {
    return this.prisma.membership.findMany({
      where: { companyId },
      include: { user: { select: { id: true, email: true, name: true } } },
      orderBy: { createdAt: "asc" },
    });
  }

  async updateRole(companyId: string, userId: string, input: UpdateMemberRoleInput) {
    const membership = await this.findOrThrow(companyId, userId);
    if (membership.role === "owner") {
      throw new BadRequestException("The owner's role can't be changed here — ownership transfer isn't supported yet");
    }
    return this.prisma.membership.update({
      where: { id: membership.id },
      data: { role: input.role },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
  }

  async remove(companyId: string, userId: string) {
    const membership = await this.findOrThrow(companyId, userId);
    if (membership.role === "owner") {
      throw new BadRequestException("The owner can't be removed from their own company");
    }
    await this.prisma.membership.delete({ where: { id: membership.id } });
    return { removed: true };
  }

  private async findOrThrow(companyId: string, userId: string) {
    const membership = await this.prisma.membership.findFirst({ where: { companyId, userId } });
    if (!membership) throw new NotFoundException("Member not found");
    return membership;
  }
}
