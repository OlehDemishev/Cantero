import { randomBytes } from "node:crypto";
import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../common/prisma/prisma.service";
import { MailService } from "../common/mail/mail.service";
import { SubcontractorPortalJwtService } from "./subcontractor-portal-jwt.service";

const LOGIN_TOKEN_TTL_MS = 15 * 60 * 1000;

@Injectable()
export class SubcontractorPortalAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly portalJwt: SubcontractorPortalJwtService,
  ) {}

  /** Same fan-out and generic-response shape as the client portal's requestLink — see portal-auth.service.ts. */
  async requestLink(email: string): Promise<{ ok: true }> {
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
        html: `<p>Click below to sign in to your ${subcontractor.company.name} subcontractor portal:</p><p><a href="${link}">Sign in</a></p><p>This link expires in 15 minutes and can only be used once.</p>`,
        text: `Sign in to your ${subcontractor.company.name} subcontractor portal: ${link}\n\nThis link expires in 15 minutes and can only be used once.`,
      });
    }

    return { ok: true };
  }

  async verify(token: string): Promise<{ accessToken: string; subcontractorName: string; companyName: string }> {
    const record = await this.prisma.subcontractorPortalLoginToken.findUnique({
      where: { token },
      include: { subcontractor: { include: { company: { select: { name: true } } } } },
    });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException("This link is invalid or has expired");
    }

    await this.prisma.subcontractorPortalLoginToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });

    const accessToken = this.portalJwt.sign({
      subcontractorId: record.subcontractorId,
      companyId: record.subcontractor.companyId,
    });
    return { accessToken, subcontractorName: record.subcontractor.name, companyName: record.subcontractor.company.name };
  }
}
