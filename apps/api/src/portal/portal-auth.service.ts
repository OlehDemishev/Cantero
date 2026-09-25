import { randomBytes } from "node:crypto";
import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../common/prisma/prisma.service";
import { MailService } from "../common/mail/mail.service";
import { PortalJwtService } from "./portal-jwt.service";
import { html } from "../common/mail/html";

const LOGIN_TOKEN_TTL_MS = 15 * 60 * 1000;

@Injectable()
export class PortalAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly portalJwt: PortalJwtService,
  ) {}

  /**
   * Emails one magic link per Client record matching this address — an end customer can
   * be a Client of more than one company, and each gets its own portal/company pairing.
   * Always returns the same generic response so this can't be used to probe which emails
   * are on file as clients.
   */
  async requestLink(email: string): Promise<{ ok: true }> {
    const clients = await this.prisma.client.findMany({
      where: { email: { equals: email, mode: "insensitive" } },
      include: { company: { select: { name: true } } },
    });
    const webOrigin = this.config.get<string>("WEB_ORIGIN") ?? "http://localhost:3000";

    for (const client of clients) {
      const token = randomBytes(24).toString("hex");
      await this.prisma.clientPortalLoginToken.create({
        data: { clientId: client.id, token, expiresAt: new Date(Date.now() + LOGIN_TOKEN_TTL_MS) },
      });
      const link = `${webOrigin}/portal/verify?token=${token}`;
      this.mail.send({
        to: email,
        subject: `Sign in to your ${client.company.name} client portal`,
        html: html`<p>Click below to sign in to your ${client.company.name} client portal:</p><p><a href="${link}">Sign in</a></p><p>This link expires in 15 minutes and can only be used once.</p>`,
        text: `Sign in to your ${client.company.name} client portal: ${link}\n\nThis link expires in 15 minutes and can only be used once.`,
      });
    }

    return { ok: true };
  }

  async verify(token: string): Promise<{ accessToken: string; clientName: string; companyName: string }> {
    const record = await this.prisma.clientPortalLoginToken.findUnique({
      where: { token },
      include: { client: { include: { company: { select: { name: true } } } } },
    });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException("This link is invalid or has expired");
    }

    await this.prisma.clientPortalLoginToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });

    const accessToken = this.portalJwt.sign({ clientId: record.clientId, companyId: record.client.companyId });
    return { accessToken, clientName: record.client.name, companyName: record.client.company.name };
  }
}
