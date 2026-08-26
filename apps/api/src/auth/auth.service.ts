import { randomBytes } from "node:crypto";
import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import type { AuthUser, LoginInput, LoginResult, SignupInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { SessionsService, type SessionMeta } from "../common/sessions/sessions.service";

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly sessions: SessionsService,
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
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      include: { memberships: { include: { customRole: true } } },
    });
    if (!user) throw new UnauthorizedException("Invalid email or password");

    const passwordOk = await bcrypt.compare(input.password, user.passwordHash);
    if (!passwordOk) throw new UnauthorizedException("Invalid email or password");

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
