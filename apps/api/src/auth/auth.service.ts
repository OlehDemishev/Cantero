import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import type { AuthUser, LoginInput, SignupInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async signup(input: SignupInput): Promise<{ accessToken: string; companyId: string }> {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictException("An account with this email already exists");

    const plan = await this.prisma.plan.findUnique({ where: { code: input.planCode } });
    if (!plan) throw new ConflictException(`Unknown plan "${input.planCode}"`);

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

    const { user, company, membership } = await this.prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: input.companyName,
          country: input.country,
          unitSystem: input.unitSystem,
          currency: input.currency,
          locale: input.locale,
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

    const accessToken = this.issueToken({
      userId: user.id,
      companyId: company.id,
      email: user.email,
      name: user.name,
      role: membership.role,
    });
    return { accessToken, companyId: company.id };
  }

  async login(input: LoginInput): Promise<{ accessToken: string; companyId: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      include: { memberships: true },
    });
    if (!user) throw new UnauthorizedException("Invalid email or password");

    const passwordOk = await bcrypt.compare(input.password, user.passwordHash);
    if (!passwordOk) throw new UnauthorizedException("Invalid email or password");

    // MVP simplification: a user belongs to exactly one company (the one they signed up with).
    // Multi-company membership switching is out of scope for the investor-demo slice.
    const membership = user.memberships[0];
    if (!membership) throw new UnauthorizedException("This account has no company membership");

    const accessToken = this.issueToken({
      userId: user.id,
      companyId: membership.companyId,
      email: user.email,
      name: user.name,
      role: membership.role,
    });
    return { accessToken, companyId: membership.companyId };
  }

  private issueToken(user: AuthUser): string {
    return this.jwtService.sign(user);
  }
}
