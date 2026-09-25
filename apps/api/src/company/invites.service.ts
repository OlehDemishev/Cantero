import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import * as bcrypt from "bcryptjs";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import type { Invite } from "@prisma/client";
import type { AcceptInviteInput, AcceptInviteResult, AuthUser, CreateInviteInput, Verify2faInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { MailService } from "../common/mail/mail.service";
import { SessionsService, type SessionMeta } from "../common/sessions/sessions.service";
import { assertPasswordPolicy } from "../common/password-policy";
import { TwoFactorService } from "../auth/two-factor.service";
import { runSerializable } from "../common/prisma/serializable-transaction";
import { assertMayAppointAdmin } from "../common/permissions/admin-appointment";
import { html } from "../common/mail/html";

/** Invites are stored by the SHA-256 of their token, like password-reset tokens: the raw token
 * exists only in the emailed link, so a leaked database or backup can't be used to accept one. */
const hashInviteToken = (raw: string) => createHash("sha256").update(raw).digest("hex");

/** What an invite looks like to the people managing them — never its token. */
const INVITE_LIST_SELECT = { id: true, email: true, role: true, expiresAt: true, createdAt: true, acceptedAt: true, companyId: true } as const;

/** Minimal shape assertSeatAvailable() needs — satisfied by both PrismaService directly (the
 * outer, fast-path check in accept()/completeAcceptAfterTwoFactor()) and a Prisma.TransactionClient
 * (the authoritative recheck inside finalizeAcceptance()'s serializable transaction). */
interface SeatCountClient {
  subscription: { findUnique: (args: { where: { companyId: string } }) => Promise<{ seats: number } | null> };
  membership: { count: (args: { where: { companyId: string } }) => Promise<number> };
  invite: {
    count: (args: {
      where: { companyId: string; acceptedAt: null; expiresAt: { gt: Date }; id?: { not: string } };
    }) => Promise<number>;
  };
}

const INVITE_TTL_DAYS = 14;
const BCRYPT_ROUNDS = 12;

@Injectable()
export class InvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly sessions: SessionsService,
    private readonly twoFactor: TwoFactorService,
  ) {}

  listPending(companyId: string) {
    return this.prisma.invite.findMany({
      where: { companyId, acceptedAt: null, expiresAt: { gt: new Date() } },
      select: INVITE_LIST_SELECT,
      orderBy: { createdAt: "desc" },
    });
  }

  async create(companyId: string, input: CreateInviteInput, actorRole?: string) {
    assertMayAppointAdmin(actorRole, input.role === "admin");
    await this.assertSeatAvailable(this.prisma, companyId);

    const existingUser = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existingUser) {
      const existingMembership = await this.prisma.membership.findFirst({
        where: { userId: existingUser.id, companyId },
      });
      if (existingMembership) throw new ConflictException("This person is already a member");
    }

    const token = randomBytes(24).toString("hex");
    const invite = await this.prisma.invite.create({
      select: INVITE_LIST_SELECT,
      data: {
        companyId,
        email: input.email,
        role: input.role,
        token: hashInviteToken(token),
        expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
      },
    });

    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    const webOrigin = this.config.get<string>("WEB_ORIGIN") ?? "http://localhost:3000";
    const acceptUrl = `${webOrigin}/accept-invite/${token}`;
    this.mail.send({
      to: invite.email,
      subject: `You're invited to join ${company.name} on Cantero`,
      html: html`<p>You've been invited to join <strong>${company.name}</strong> on Cantero as ${invite.role}.</p><p><a href="${acceptUrl}">Accept invite</a></p><p>This link expires in ${INVITE_TTL_DAYS} days.</p>`,
      text: `You've been invited to join ${company.name} on Cantero as ${invite.role}.\n\nAccept your invite: ${acceptUrl}\n\nThis link expires in ${INVITE_TTL_DAYS} days.`,
    });

    return invite;
  }

  async revoke(companyId: string, id: string, actorRole?: string) {
    const invite = await this.prisma.invite.findFirst({ where: { id, companyId } });
    if (!invite) throw new NotFoundException("Invite not found");
    assertMayAppointAdmin(actorRole, invite.role === "admin");
    await this.prisma.invite.delete({ where: { id } });
    return { revoked: true };
  }

  /** Public lookup — no auth, used by the accept-invite page to show what company/role the invite
   * is for. Only what that page shows: anyone holding the link gets this, so never the company row
   * itself (its chat webhook URLs, feed tokens, ...). */
  async getPublicByToken(token: string) {
    const invite = await this.getByToken(token);
    return { email: invite.email, role: invite.role, expiresAt: invite.expiresAt, company: { name: invite.company.name, locale: invite.company.locale } };
  }

  async getByToken(token: string) {
    const invite = await this.prisma.invite.findUnique({ where: { token: hashInviteToken(token) }, include: { company: true } });
    if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
      throw new NotFoundException("Invite not found or expired");
    }
    return invite;
  }

  /**
   * When the invited email belongs to a brand-new account, this both sets that account's initial
   * password and completes the invite in one step — there's nothing to authenticate against yet.
   * When it belongs to an *existing* account, `password` must be that account's real password:
   * an invite token proves the inviter can reach that inbox, not that the person accepting it is
   * the account owner, so it must never be usable to sign in as someone else. An existing account
   * with 2FA active gets a challenge back (same shape as a normal login) instead of a token.
   */
  async accept(input: AcceptInviteInput, meta: SessionMeta): Promise<AcceptInviteResult> {
    const invite = await this.getByToken(input.token);
    await this.assertSeatAvailable(this.prisma, invite.companyId, invite.id);

    const existingUser = await this.prisma.user.findUnique({ where: { email: invite.email } });
    if (existingUser) {
      const existingMembership = await this.prisma.membership.findFirst({
        where: { userId: existingUser.id, companyId: invite.companyId },
      });
      if (existingMembership) throw new ConflictException("This person is already a member");

      const passwordOk = await bcrypt.compare(input.password, existingUser.passwordHash);
      if (!passwordOk) throw new UnauthorizedException("Invalid email or password");

      if (existingUser.totpEnabledAt) {
        const challengeToken = this.jwtService.sign(
          { userId: existingUser.id, inviteToken: input.token, kind: "invite_2fa_challenge" },
          { expiresIn: "10m" },
        );
        return { requires2fa: true, challengeToken };
      }

      return this.finalizeAcceptance(invite, meta, existingUser.id);
    }

    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: invite.companyId },
      select: { passwordMinLength: true, passwordRequireSymbol: true },
    });
    assertPasswordPolicy(input.password, company);
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

    return this.finalizeAcceptance(invite, meta, undefined, { name: input.name, passwordHash });
  }

  /** Completes accept() for an existing account that has 2FA active — mirrors AuthService's
   * login → TwoFactorService.verifyChallenge two-step exactly, just ending in a membership
   * instead of a plain sign-in. */
  async completeAcceptAfterTwoFactor(input: Verify2faInput, meta: SessionMeta): Promise<{ accessToken: string; companyId: string }> {
    let payload: { userId: string; inviteToken: string; kind?: string };
    try {
      payload = await this.jwtService.verifyAsync(input.challengeToken);
      if (payload.kind !== "invite_2fa_challenge") throw new Error("wrong kind");
    } catch {
      throw new UnauthorizedException("Invalid or expired challenge");
    }

    const ok = await this.twoFactor.verifyCodeForUser(payload.userId, input.code, "invite-2fa-verify");
    if (!ok) throw new UnauthorizedException("Invalid code");

    const invite = await this.getByToken(payload.inviteToken);
    await this.assertSeatAvailable(this.prisma, invite.companyId, invite.id);
    return this.finalizeAcceptance(invite, meta, payload.userId);
  }

  /** Shared tail of both accept() and completeAcceptAfterTwoFactor(): creates the new-user row
   * when needed, then the membership and invite-accepted flag, all in one SERIALIZABLE
   * transaction, then a normal session/token exactly like a fresh login. Re-checks both the seat
   * count and an existing membership inside the transaction — the outer checks in
   * accept()/completeAcceptAfterTwoFactor() are for a fast, friendly error in the common case, not
   * the only guard against a race. Without the re-check running under serializable isolation (not
   * just inside *a* transaction), two concurrent accepts for a company's last open seat could each
   * read the same pre-acceptance counts, both pass, and together oversell it — runSerializable
   * aborts and retries the loser, so its retry sees the winner's already-committed membership. */
  private async finalizeAcceptance(
    invite: Invite,
    meta: SessionMeta,
    userId?: string,
    newUser?: { name: string; passwordHash: string },
  ): Promise<{ accessToken: string; companyId: string }> {
    const { user, membership } = await runSerializable(this.prisma, async (tx) => {
      await this.assertSeatAvailable(tx, invite.companyId, invite.id);

      const user = userId
        ? await tx.user.findUniqueOrThrow({ where: { id: userId } })
        : await tx.user.create({ data: { email: invite.email, ...newUser! } });

      const existingMembership = await tx.membership.findFirst({ where: { userId: user.id, companyId: invite.companyId } });
      if (existingMembership) throw new ConflictException("This person is already a member");

      const membership = await tx.membership.create({
        data: { userId: user.id, companyId: invite.companyId, role: invite.role },
      });
      await tx.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
      return { user, membership };
    });

    const sid = await this.sessions.create(user.id, meta);
    const authUser: AuthUser = {
      userId: user.id,
      companyId: invite.companyId,
      email: user.email,
      name: user.name,
      role: membership.role,
      sid,
    };
    return { accessToken: this.jwtService.sign(authUser), companyId: invite.companyId };
  }

  /** `excludeInviteId` matters only when accepting: the invite being accepted is itself still an
   * unaccepted, unexpired row in the pending count at the moment this runs, but accepting it
   * converts an existing reservation into a membership rather than consuming a new seat — without
   * excluding it, seats read as one short of what's actually available and the *last* invite in a
   * fully-reserved company could never be accepted. */
  private async assertSeatAvailable(client: SeatCountClient, companyId: string, excludeInviteId?: string): Promise<void> {
    const subscription = await client.subscription.findUnique({ where: { companyId } });
    const seats = subscription?.seats ?? 1;

    const [memberCount, pendingInviteCount] = await Promise.all([
      client.membership.count({ where: { companyId } }),
      client.invite.count({
        where: {
          companyId,
          acceptedAt: null,
          expiresAt: { gt: new Date() },
          ...(excludeInviteId ? { id: { not: excludeInviteId } } : {}),
        },
      }),
    ]);

    if (memberCount + pendingInviteCount >= seats) {
      throw new BadRequestException(
        `Seat limit reached (${seats}) — upgrade seats before inviting another person`,
      );
    }
  }
}
