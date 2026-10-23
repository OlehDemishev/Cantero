import { randomBytes } from "node:crypto";
import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../common/prisma/prisma.service";
import { MailService } from "../common/mail/mail.service";
import { SupplierPortalJwtService, type PortalSupplierContext } from "./supplier-portal-jwt.service";
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
export class SupplierPortalAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly portalJwt: SupplierPortalJwtService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  /** Same fan-out and generic-response shape as the subcontractor portal's requestLink. */
  async requestLink(email: string, ip?: string): Promise<{ ok: true }> {
    if (ip) this.rateLimiter.consume(`portal-link:ip:${ip}`, PORTAL_LINK_IP_LIMIT, PORTAL_LINK_WINDOW_MS);
    this.rateLimiter.consume(`portal-link:supplier:${email.toLowerCase()}`, PORTAL_LINK_EMAIL_LIMIT, PORTAL_LINK_WINDOW_MS);
    const suppliers = await this.prisma.supplier.findMany({
      where: { email: { equals: email, mode: "insensitive" } },
      include: { company: { select: { name: true } } },
    });
    const webOrigin = this.config.get<string>("WEB_ORIGIN") ?? "http://localhost:3000";

    for (const supplier of suppliers) {
      const token = randomBytes(24).toString("hex");
      await this.prisma.supplierPortalLoginToken.create({
        data: { supplierId: supplier.id, token, expiresAt: new Date(Date.now() + LOGIN_TOKEN_TTL_MS) },
      });
      const link = `${webOrigin}/supplier-portal/verify?token=${token}`;
      this.mail.send({
        to: email,
        subject: `Sign in to your ${supplier.company.name} supplier portal`,
        html: html`<p>Click below to sign in to your ${supplier.company.name} supplier portal:</p><p><a href="${link}">Sign in</a></p><p>This link expires in 15 minutes and can only be used once.</p>`,
        text: `Sign in to your ${supplier.company.name} supplier portal: ${link}\n\nThis link expires in 15 minutes and can only be used once.`,
      });
    }

    return { ok: true };
  }

  async verify(token: string): Promise<{ accessToken: string; supplierName: string; companyName: string }> {
    // Check and use in one conditional write, so two concurrent verifies can't both succeed.
    const now = new Date();
    const { count } = await this.prisma.supplierPortalLoginToken.updateMany({
      where: { token, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (count !== 1) throw new BadRequestException(INVALID_LINK);
    const record = await this.prisma.supplierPortalLoginToken.findUnique({
      where: { token },
      include: { supplier: { include: { company: { select: { name: true } } } } },
    });
    if (!record) throw new BadRequestException(INVALID_LINK);

    const accessToken = this.portalJwt.sign({
      supplierId: record.supplierId,
      companyId: record.supplier.companyId,
      tokenVersion: record.supplier.portalTokenVersion,
    });
    return { accessToken, supplierName: record.supplier.name, companyName: record.supplier.company.name };
  }

  /** Signs the supplier out of the portal on every device: bumping portalTokenVersion retires every
   * portal token issued to them so far, which SupplierPortalAuthGuard then refuses. */
  async logout(portal: PortalSupplierContext): Promise<{ ok: true }> {
    await this.prisma.supplier.updateMany({
      where: { id: portal.supplierId, companyId: portal.companyId },
      data: { portalTokenVersion: { increment: 1 } },
    });
    return { ok: true };
  }
}
