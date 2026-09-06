import { randomBytes } from "node:crypto";
import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import type { AuthUser, LoginInput, LoginResult, SignupInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { SessionsService, type SessionMeta } from "../common/sessions/sessions.service";
import { RateLimiterService } from "../common/rate-limiter/rate-limiter.service";

const BCRYPT_ROUNDS = 12;

// Two independent dimensions: per-IP catches a single source hammering many accounts
// (credential stuffing / password spraying), per-email catches many sources hammering one
// account (a distributed/botnet attack, or just credential stuffing that got lucky on the IP
// spread). Neither limit alone covers both attack shapes.
const LOGIN_IP_LIMIT = 20;
const LOGIN_EMAIL_LIMIT = 8;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly sessions: SessionsService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  async signup(input: SignupInput, meta: SessionMeta): Promise<{ accessToken: string; companyId: string }> {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictException("An account with this email already exists");

    const plan = await this.prisma.plan.findUnique({ where: { code: input.planCode } });
    if (!plan) throw new ConflictException(`Unknown plan "${input.planCode}"`);

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

    // Silently ignored if the code doesn't match anything — a typo'd/expired referral link
    // shouldn't block someone from signing up.
    const referredBy = input.referralCode
      ? await this.prisma.company.findUnique({ where: { referralCode: input.referralCode }, select: { id: true } })
      : null;

    const { user, company, membership } = await this.prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: input.companyName,
          country: input.country,
          unitSystem: input.unitSystem,
          currency: input.currency,
          locale: input.locale,
          referralCode: randomBytes(4).toString("hex"),
          referredByCompanyId: referredBy?.id,
        },
      });
      const user = await tx.user.create({
        data: { email: input.email, passwordHash, name: input.name },
      });
      const membership = await tx.membership.create({
        data: { userId: user.id, companyId: company.id, role: "owner" },
      });
      await tx.subscription.create({
        data: { companyId: company.id, planId: plan.id, status: "incomplete", seats: 1 },
      });
      return { user, company, membership };
    });

    const accessToken = await this.issueAccessToken(
      {
        userId: user.id,
        companyId: company.id,
        email: user.email,
        name: user.name,
        role: membership.role,
      },
      meta,
    );
    return { accessToken, companyId: company.id };
  }

  async login(input: LoginInput, meta: SessionMeta): Promise<LoginResult> {
    const emailKey = `login-email:${input.email.toLowerCase()}`;
    const ipKey = `login-ip:${meta.ipAddress ?? "unknown"}`;
    this.rateLimiter.consume(ipKey, LOGIN_IP_LIMIT, LOGIN_WINDOW_MS);
    this.rateLimiter.consume(emailKey, LOGIN_EMAIL_LIMIT, LOGIN_WINDOW_MS);

    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      include: { memberships: { include: { customRole: true } } },
    });
    if (!user) throw new UnauthorizedException("Invalid email or password");

    const passwordOk = await bcrypt.compare(input.password, user.passwordHash);
    if (!passwordOk) throw new UnauthorizedException("Invalid email or password");

    // The password itself is what's being brute-forced here — once it's confirmed correct,
    // further failures (if any) happen in the 2FA step, which has its own separate limiter.
    this.rateLimiter.reset(ipKey);
    this.rateLimiter.reset(emailKey);

    // MVP simplification: a user belongs to exactly one company (the one they signed up with).
    // Multi-company membership switching is out of scope for the investor-demo slice.
    const membership = user.memberships[0];
    if (!membership) throw new UnauthorizedException("This account has no company membership");

    if (user.totpEnabledAt) {
      const challengeToken = this.jwtService.sign({ userId: user.id, kind: "2fa_challenge" }, { expiresIn: "10m" });
      return { requires2fa: true, challengeToken };
    }

    const accessToken = await this.issueAccessToken(
      {
        userId: user.id,
        companyId: membership.companyId,
        email: user.email,
        name: user.name,
        role: membership.role,
        additionalRoles: membership.customRole?.basePermissions,
      },
      meta,
    );
    return { accessToken, companyId: membership.companyId };
  }

  async issueAccessToken(user: Omit<AuthUser, "sid">, meta: SessionMeta): Promise<string> {
    const sid = await this.sessions.create(user.userId, meta);
    return this.jwtService.sign({ ...user, sid } satisfies AuthUser);
  }
}
