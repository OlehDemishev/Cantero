import { randomBytes } from "node:crypto";
import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../common/prisma/prisma.service";
import { MailService } from "../common/mail/mail.service";
import { SupplierPortalJwtService } from "./supplier-portal-jwt.service";

const LOGIN_TOKEN_TTL_MS = 15 * 60 * 1000;

@Injectable()
export class SupplierPortalAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly portalJwt: SupplierPortalJwtService,
  ) {}

  /** Same fan-out and generic-response shape as the subcontractor portal's requestLink. */
  async requestLink(email: string): Promise<{ ok: true }> {
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
        html: `<p>Click below to sign in to your ${supplier.company.name} supplier portal:</p><p><a href="${link}">Sign in</a></p><p>This link expires in 15 minutes and can only be used once.</p>`,
        text: `Sign in to your ${supplier.company.name} supplier portal: ${link}\n\nThis link expires in 15 minutes and can only be used once.`,
      });
    }

    return { ok: true };
  }

  async verify(token: string): Promise<{ accessToken: string; supplierName: string; companyName: string }> {
    const record = await this.prisma.supplierPortalLoginToken.findUnique({
      where: { token },
      include: { supplier: { include: { company: { select: { name: true } } } } },
    });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException("This link is invalid or has expired");
    }

    await this.prisma.supplierPortalLoginToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });

    const accessToken = this.portalJwt.sign({
      supplierId: record.supplierId,
      companyId: record.supplier.companyId,
    });
    return { accessToken, supplierName: record.supplier.name, companyName: record.supplier.company.name };
  }
}
