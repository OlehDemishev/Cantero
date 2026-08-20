import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import * as bcrypt from "bcryptjs";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import type { AcceptInviteInput, AuthUser, CreateInviteInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { MailService } from "../common/mail/mail.service";

const INVITE_TTL_DAYS = 14;
const BCRYPT_ROUNDS = 12;

@Injectable()
export class InvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  listPending(companyId: string) {
    return this.prisma.invite.findMany({
      where: { companyId, acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
  }

  async create(companyId: string, input: CreateInviteInput) {
    await this.assertSeatAvailable(companyId);

    const existingUser = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existingUser) {
      const existingMembership = await this.prisma.membership.findFirst({
        where: { userId: existingUser.id, companyId },
      });
      if (existingMembership) throw new ConflictException("This person is already a member");
    }

    const token = randomBytes(24).toString("hex");
    const invite = await this.prisma.invite.create({
      data: {
        companyId,
        email: input.email,
        role: input.role,
        token,
        expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
      },
    });

    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    const webOrigin = this.config.get<string>("WEB_ORIGIN") ?? "http://localhost:3000";
    const acceptUrl = `${webOrigin}/accept-invite/${token}`;
    this.mail.send({
      to: invite.email,
      subject: `You're invited to join ${company.name} on Cantero`,
      html: `<p>You've been invited to join <strong>${company.name}</strong> on Cantero as ${invite.role}.</p><p><a href="${acceptUrl}">Accept invite</a></p><p>This link expires in ${INVITE_TTL_DAYS} days.</p>`,
      text: `You've been invited to join ${company.name} on Cantero as ${invite.role}.\n\nAccept your invite: ${acceptUrl}\n\nThis link expires in ${INVITE_TTL_DAYS} days.`,
    });

    return invite;
  }

  async revoke(companyId: string, id: string) {
    const invite = await this.prisma.invite.findFirst({ where: { id, companyId } });
    if (!invite) throw new NotFoundException("Invite not found");
    await this.prisma.invite.delete({ where: { id } });
    return { revoked: true };
  }

  /** Public lookup — no auth, used by the accept-invite page to show what company/role the invite is for. */
  async getByToken(token: string) {
    const invite = await this.prisma.invite.findUnique({ where: { token }, include: { company: true } });
    if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
      throw new NotFoundException("Invite not found or expired");
    }
    return invite;
  }

  async accept(input: AcceptInviteInput): Promise<{ accessToken: string; companyId: string }> {
    const invite = await this.getByToken(input.token);
    await this.assertSeatAvailable(invite.companyId);

    const existingUser = await this.prisma.user.findUnique({ where: { email: invite.email } });
    if (existingUser) {
      const existingMembership = await this.prisma.membership.findFirst({
        where: { userId: existingUser.id, companyId: invite.companyId },
      });
      if (existingMembership) throw new ConflictException("This person is already a member");
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

    const { user, membership } = await this.prisma.$transaction(async (tx) => {
      const user =
        existingUser ??
        (await tx.user.create({ data: { email: invite.email, passwordHash, name: input.name } }));
      const membership = await tx.membership.create({
        data: { userId: user.id, companyId: invite.companyId, role: invite.role },
      });
      await tx.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
      return { user, membership };
    });

    const authUser: AuthUser = {
      userId: user.id,
      companyId: invite.companyId,
      email: user.email,
      name: user.name,
      role: membership.role,
    };
    return { accessToken: this.jwtService.sign(authUser), companyId: invite.companyId };
  }

  private async assertSeatAvailable(companyId: string): Promise<void> {
    const subscription = await this.prisma.subscription.findUnique({ where: { companyId } });
    const seats = subscription?.seats ?? 1;

    const [memberCount, pendingInviteCount] = await Promise.all([
      this.prisma.membership.count({ where: { companyId } }),
      this.prisma.invite.count({ where: { companyId, acceptedAt: null, expiresAt: { gt: new Date() } } }),
    ]);

    if (memberCount + pendingInviteCount >= seats) {
      throw new BadRequestException(
        `Seat limit reached (${seats}) — upgrade seats before inviting another person`,
      );
    }
  }
}
