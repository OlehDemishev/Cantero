import { randomBytes, createHash } from "node:crypto";
import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcryptjs";
import type { ForgotPasswordInput, ResetPasswordInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { MailService } from "../common/mail/mail.service";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const BCRYPT_ROUNDS = 12;

const hashToken = (raw: string) => createHash("sha256").update(raw).digest("hex");

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  /** Always succeeds from the caller's point of view, whether or not the email exists — an
   * account-enumeration-safe response, same reasoning as most password-reset flows. */
  async forgotPassword(input: ForgotPasswordInput): Promise<{ ok: true }> {
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
      html: `<p>We received a request to reset your password. This link is valid for 1 hour:</p><p><a href="${link}">${link}</a></p><p>If you didn't request this, you can ignore this email.</p>`,
    });
    return { ok: true };
  }

  async resetPassword(input: ResetPasswordInput): Promise<{ ok: true }> {
    const tokenHash = hashToken(input.token);
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException("This reset link is invalid or has expired");
    }

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
