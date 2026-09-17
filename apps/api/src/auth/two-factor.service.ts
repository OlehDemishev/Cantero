import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { authenticator } from "otplib";
import * as bcrypt from "bcryptjs";
import type { LoginResult } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import type { SessionMeta } from "../common/sessions/sessions.service";
import { RateLimiterService } from "../common/rate-limiter/rate-limiter.service";
import { AuthService } from "./auth.service";

const BACKUP_CODE_COUNT = 8;
const BCRYPT_ROUNDS = 10;

// A correct password is needed to even get a challenge token, so this is defense-in-depth rather
// than the primary defense — but a 6-digit TOTP is only ~1e6 possibilities, cheap to brute-force
// within the 10-minute challenge window without some limit here.
const VERIFY_LIMIT = 8;
const VERIFY_WINDOW_MS = 15 * 60 * 1000;

function randomBackupCode(): string {
  return Array.from({ length: 10 }, () => Math.floor(Math.random() * 36).toString(36)).join("").toUpperCase();
}

@Injectable()
export class TwoFactorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  /** Generates a fresh secret and stashes it as *pending*, unconfirmed — the live totpSecret (if
   * any) is never touched here. 2FA only actually turns on, or an existing authenticator only
   * actually gets replaced, once enable() verifies a code generated from the pending secret. This
   * means abandoning the flow after setup() (closing the tab before scanning the new QR code, a
   * network blip, anything) leaves the previously-working authenticator — if there was one —
   * completely unaffected; only enable() ever writes to totpSecret. Once 2FA is already active,
   * generating a new pending secret is a sensitive action gated on the current password —
   * otherwise anyone holding a valid access token (e.g. one obtained some other way) could
   * silently queue up a replacement authenticator. */
  async setup(userId: string, email: string, currentPassword?: string): Promise<{ secret: string; otpauthUrl: string }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.totpEnabledAt) {
      if (!currentPassword || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
        throw new UnauthorizedException("Current password is required to replace an active authenticator");
      }
    }

    const secret = authenticator.generateSecret();
    await this.prisma.user.update({ where: { id: userId }, data: { pendingTotpSecret: secret } });
    const otpauthUrl = authenticator.keyuri(email, "Cantero", secret);
    return { secret, otpauthUrl };
  }

  /** Verifies a code against the *pending* secret from setup(), and only then atomically promotes
   * it to the live totpSecret — the one moment the live secret ever changes. Clears
   * pendingTotpSecret either way isn't needed on failure (a wrong code shouldn't discard a setup
   * the user might retry), but succeeding always clears it, since it's now redundant with the
   * (identical) live secret. */
  async enable(userId: string, code: string): Promise<{ backupCodes: string[] }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.pendingTotpSecret) throw new BadRequestException("Call setup first");
    if (!authenticator.verify({ token: code, secret: user.pendingTotpSecret })) {
      throw new BadRequestException("Invalid code");
    }

    const backupCodes = Array.from({ length: BACKUP_CODE_COUNT }, randomBackupCode);
    const hashed = await Promise.all(backupCodes.map((c) => bcrypt.hash(c, BCRYPT_ROUNDS)));
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpSecret: user.pendingTotpSecret, pendingTotpSecret: null, totpEnabledAt: new Date(), totpBackupCodes: hashed },
    });
    return { backupCodes };
  }

  async disable(userId: string, password: string): Promise<{ ok: true }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const passwordOk = await bcrypt.compare(password, user.passwordHash);
    if (!passwordOk) throw new UnauthorizedException("Invalid password");

    await this.prisma.user.update({
      where: { id: userId },
      data: { totpSecret: null, pendingTotpSecret: null, totpEnabledAt: null, totpBackupCodes: [] },
    });
    return { ok: true };
  }

  /** Redeems a 2FA login challenge — the code can be either a live TOTP code or a one-time
   * backup code (consumed on use). Issues a normal access token exactly like a 2FA-less login. */
  async verifyChallenge(challengeToken: string, code: string, meta: SessionMeta): Promise<LoginResult> {
    let userId: string;
    try {
      const payload = await this.jwtService.verifyAsync<{ userId: string; kind?: string }>(challengeToken);
      if (payload.kind !== "2fa_challenge") throw new Error("wrong kind");
      userId = payload.userId;
    } catch {
      throw new UnauthorizedException("Invalid or expired challenge");
    }

    const ok = await this.verifyCodeForUser(userId, code, "2fa-verify");
    if (!ok) throw new UnauthorizedException("Invalid code");

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { memberships: { include: { customRole: true } } },
    });
    const membership = user?.memberships[0];
    if (!membership) throw new UnauthorizedException("This account has no company membership");

    const accessToken = await this.authService.issueAccessToken(
      {
        userId: userId,
        companyId: membership.companyId,
        email: user!.email,
        name: user!.name,
        role: membership.role,
        additionalRoles: membership.customRole?.basePermissions,
      },
      meta,
    );
    return { accessToken, companyId: membership.companyId };
  }

  /**
   * Checks a TOTP or backup code (consumed on use) against a user's active 2FA, rate-limited per
   * `rateLimitPrefix` + userId so this can back more than one challenge flow (login, invite
   * acceptance, ...) without sharing a single limiter bucket between unrelated flows. Returns
   * false rather than throwing on a bad code, invalid user, or inactive 2FA — the caller decides
   * what that means for its own flow.
   */
  async verifyCodeForUser(userId: string, code: string, rateLimitPrefix: string): Promise<boolean> {
    const rateLimitKey = `${rateLimitPrefix}:${userId}`;
    this.rateLimiter.consume(rateLimitKey, VERIFY_LIMIT, VERIFY_WINDOW_MS);

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.totpSecret || !user.totpEnabledAt) return false;

    const totpOk = authenticator.verify({ token: code, secret: user.totpSecret });
    if (!totpOk) {
      const matchIndex = await this.findBackupCodeIndex(user.totpBackupCodes, code);
      if (matchIndex === -1) return false;
      const remaining = [...user.totpBackupCodes];
      remaining.splice(matchIndex, 1);
      await this.prisma.user.update({ where: { id: userId }, data: { totpBackupCodes: remaining } });
    }

    this.rateLimiter.reset(rateLimitKey);
    return true;
  }

  private async findBackupCodeIndex(hashedCodes: string[], candidate: string): Promise<number> {
    for (let i = 0; i < hashedCodes.length; i++) {
      if (await bcrypt.compare(candidate.toUpperCase(), hashedCodes[i])) return i;
    }
    return -1;
  }
}
