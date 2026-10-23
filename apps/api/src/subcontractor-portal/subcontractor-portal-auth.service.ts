import { randomBytes } from "node:crypto";
import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../common/prisma/prisma.service";
import { MailService } from "../common/mail/mail.service";
import { SubcontractorPortalJwtService, type PortalSubcontractorContext } from "./subcontractor-portal-jwt.service";
import { html } from "../common/mail/html";
import { RateLimiterService } from "../common/rate-limiter/rate-limiter.service";

const LOGIN_TOKEN_TTL_MS = 15 * 60 * 1000;
// Each request mails a link, so both are capped: per address (against flooding one inbox) and per
// IP across all three portals (against one client spraying addresses). Same in-process limiter as
// password login.
export const PORTAL_LINK_EMAIL_LIMIT = 5;
export const PORTAL_LINK_IP_LIMIT = 20;
export const PORTAL_LINK_WINDOW_MS = 15 * 60 * 1000;
const INVALID_LINK = "This link is invalid or has expired";

@Injectable()
export class SubcontractorPortalAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly portalJwt: SubcontractorPortalJwtService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  /** Same fan-out and generic-response shape as the client portal's requestLink — see portal-auth.service.ts. */
  async requestLink(email: string, ip?: string): Promise<{ ok: true }> {
    if (ip) this.rateLimiter.consume(`portal-link:ip:${ip}`, PORTAL_LINK_IP_LIMIT, PORTAL_LINK_WINDOW_MS);
    this.rateLimiter.consume(`portal-link:subcontractor:${email.toLowerCase()}`, PORTAL_LINK_EMAIL_LIMIT, PORTAL_LINK_WINDOW_MS);
    const subcontractors = await this.prisma.subcontractor.findMany({
      where: { email: { equals: email, mode: "insensitive" } },
      include: { company: { select: { name: true } } },
    });
    const webOrigin = this.config.get<string>("WEB_ORIGIN") ?? "http://localhost:3000";

    for (const subcontractor of subcontractors) {
      const token = randomBytes(24).toString("hex");
      await this.prisma.subcontractorPortalLoginToken.create({
        data: { subcontractorId: subcontractor.id, token, expiresAt: new Date(Date.now() + LOGIN_TOKEN_TTL_MS) },
      });
      const link = `${webOrigin}/subcontractor-portal/verify?token=${token}`;
      this.mail.send({
        to: email,
        subject: `Sign in to your ${subcontractor.company.name} subcontractor portal`,
        html: html`<p>Click below to sign in to your ${subcontractor.company.name} subcontractor portal:</p><p><a href="${link}">Sign in</a></p><p>This link expires in 15 minutes and can only be used once.</p>`,
        text: `Sign in to your ${subcontractor.company.name} subcontractor portal: ${link}\n\nThis link expires in 15 minutes and can only be used once.`,
      });
    }

    return { ok: true };
  }

  async verify(token: string): Promise<{ accessToken: string; subcontractorName: string; companyName: string }> {
    // Check and use in one conditional write, so two concurrent verifies can't both succeed.
    const now = new Date();
    const { count } = await this.prisma.subcontractorPortalLoginToken.updateMany({
      where: { token, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (count !== 1) throw new BadRequestException(INVALID_LINK);
    const record = await this.prisma.subcontractorPortalLoginToken.findUnique({
      where: { token },
      include: { subcontractor: { include: { company: { select: { name: true } } } } },
    });
    if (!record) throw new BadRequestException(INVALID_LINK);

    const accessToken = this.portalJwt.sign({
      subcontractorId: record.subcontractorId,
      companyId: record.subcontractor.companyId,
      tokenVersion: record.subcontractor.portalTokenVersion,
    });
    return { accessToken, subcontractorName: record.subcontractor.name, companyName: record.subcontractor.company.name };
  }

  /** Signs the subcontractor out of the portal on every device: bumping portalTokenVersion retires every
   * portal token issued to them so far, which SubcontractorPortalAuthGuard then refuses. */
  async logout(portal: PortalSubcontractorContext): Promise<{ ok: true }> {
    await this.prisma.subcontractor.updateMany({
      where: { id: portal.subcontractorId, companyId: portal.companyId },
      data: { portalTokenVersion: { increment: 1 } },
    });
    return { ok: true };
  }
}
