import { randomBytes, createHash } from "node:crypto";
import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcryptjs";
import type { ForgotPasswordInput, ResetPasswordInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { MailService } from "../common/mail/mail.service";
import { assertPasswordPolicy } from "../common/password-policy";
import { RateLimiterService } from "../common/rate-limiter/rate-limiter.service";
import { html } from "../common/mail/html";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const BCRYPT_ROUNDS = 12;
// The reset token itself (randomBytes(32)) is infeasible to brute-force — this limit exists to
// stop someone from email-bombing a victim's inbox with reset requests, not to protect the token.
const FORGOT_PASSWORD_LIMIT = 5;
const FORGOT_PASSWORD_WINDOW_MS = 15 * 60 * 1000;

const hashToken = (raw: string) => createHash("sha256").update(raw).digest("hex");

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  /** Always succeeds from the caller's point of view, whether or not the email exists — an
   * account-enumeration-safe response, same reasoning as most password-reset flows. */
  async forgotPassword(input: ForgotPasswordInput): Promise<{ ok: true }> {
    this.rateLimiter.consume(`forgot-password:${input.email.toLowerCase()}`, FORGOT_PASSWORD_LIMIT, FORGOT_PASSWORD_WINDOW_MS);

    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!user) {
      this.logger.debug(`Password reset requested for unknown email ${input.email}`);
      return { ok: true };
    }

    const rawToken = randomBytes(32).toString("hex");
    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashToken(rawToken), expiresAt: new Date(Date.now() + TOKEN_TTL_MS) },
    });

    const webOrigin = this.config.get<string>("WEB_ORIGIN") ?? "http://localhost:3000";
    const link = `${webOrigin}/reset-password?token=${rawToken}`;
    await this.mail.send({
      to: user.email,
      subject: "Reset your Cantero password",
      text: `We received a request to reset your password. This link is valid for 1 hour: ${link}\n\nIf you didn't request this, you can ignore this email.`,
      html: html`<p>We received a request to reset your password. This link is valid for 1 hour:</p><p><a href="${link}">${link}</a></p><p>If you didn't request this, you can ignore this email.</p>`,
    });
    return { ok: true };
  }

  async resetPassword(input: ResetPasswordInput): Promise<{ ok: true }> {
    const tokenHash = hashToken(input.token);
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException("This reset link is invalid or has expired");
    }

    // A user can belong to more than one company — apply the strictest policy among them so no
    // company's rule is silently bypassed.
    const memberships = await this.prisma.membership.findMany({
      where: { userId: record.userId },
      select: { company: { select: { passwordMinLength: true, passwordRequireSymbol: true } } },
    });
    const strictestPolicy = memberships.reduce(
      (strictest, m) => ({
        passwordMinLength: Math.max(strictest.passwordMinLength, m.company.passwordMinLength),
        passwordRequireSymbol: strictest.passwordRequireSymbol || m.company.passwordRequireSymbol,
      }),
      { passwordMinLength: 8, passwordRequireSymbol: false },
    );
    assertPasswordPolicy(input.password, strictestPolicy);

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      // A password reset is a good moment to sign every other device out too.
      this.prisma.userSession.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    return { ok: true };
  }
}
