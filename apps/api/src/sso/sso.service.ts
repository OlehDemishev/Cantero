import { randomBytes } from "node:crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { SAML } from "@node-saml/node-saml";
import type { AuthUser, UpdateSsoConfigInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { SessionsService, type SessionMeta } from "../common/sessions/sessions.service";

interface SsoConfig {
  ssoDomain: string | null;
  ssoEntryPoint: string | null;
  ssoIssuer: string | null;
  ssoCert: string | null;
}

@Injectable()
export class SsoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly sessions: SessionsService,
  ) {}

  async getConfig(companyId: string) {
    return this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { ssoDomain: true, ssoEntryPoint: true, ssoIssuer: true, ssoCert: true },
    });
  }

  async updateConfig(companyId: string, actor: AuditActor, input: UpdateSsoConfigInput) {
    try {
      await this.prisma.company.update({
        where: { id: companyId },
        data: { ssoDomain: input.domain.toLowerCase(), ssoEntryPoint: input.entryPoint, ssoIssuer: input.issuer, ssoCert: input.cert },
      });
    } catch (err) {
      if ((err as { code?: string }).code === "P2002") {
        throw new BadRequestException("This domain is already configured for SSO on another company");
      }
      throw err;
    }
    this.audit.record(companyId, actor, "sso.configured", "Company", companyId, `Configured SSO for domain ${input.domain}`);
    return this.getConfig(companyId);
  }

  async disable(companyId: string, actor: AuditActor) {
    await this.prisma.company.update({
      where: { id: companyId },
      data: { ssoDomain: null, ssoEntryPoint: null, ssoIssuer: null, ssoCert: null },
    });
    this.audit.record(companyId, actor, "sso.disabled", "Company", companyId, "Disabled SSO");
    return this.getConfig(companyId);
  }

  /** Unsigned SP metadata XML a customer's IdP admin imports to configure their side — no IdP config needed to generate it. */
  spMetadata(companyId: string): string {
    const saml = this.buildSaml(companyId, { ssoEntryPoint: undefined, ssoIssuer: undefined, ssoCert: "unused" });
    return saml.generateServiceProviderMetadata(null, null);
  }

  /** Resolves the login email's domain to a company with SSO configured, and returns the IdP redirect URL. Never confirms/denies whether an email itself is registered — only whether its domain has SSO. */
  async startLogin(email: string): Promise<{ redirectUrl: string }> {
    const domain = email.split("@")[1]?.toLowerCase();
    if (!domain) throw new BadRequestException("Invalid email");

    const company = await this.prisma.company.findFirst({
      where: { ssoDomain: domain, ssoEntryPoint: { not: null }, ssoIssuer: { not: null }, ssoCert: { not: null } },
    });
    if (!company) throw new NotFoundException("SSO isn't configured for this email's domain");

    const saml = this.buildSaml(company.id, {
      ssoEntryPoint: company.ssoEntryPoint!,
      ssoIssuer: company.ssoIssuer!,
      ssoCert: company.ssoCert!,
    });
    const redirectUrl = await saml.getAuthorizeUrlAsync("", undefined, {});
    return { redirectUrl };
  }

  /** Validates the IdP's SAML response, just-in-time provisions the user (as "worker") on first sign-in, and returns our own access token. */
  async handleAcs(companyId: string, samlResponse: string, meta: SessionMeta): Promise<{ accessToken: string }> {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company?.ssoEntryPoint || !company.ssoIssuer || !company.ssoCert) {
      throw new NotFoundException("SSO isn't configured for this company");
    }

    const saml = this.buildSaml(company.id, {
      ssoEntryPoint: company.ssoEntryPoint,
      ssoIssuer: company.ssoIssuer,
      ssoCert: company.ssoCert,
    });
    const { profile } = await saml.validatePostResponseAsync({ SAMLResponse: samlResponse });
    const email = (profile?.email ?? profile?.mail ?? profile?.nameID ?? "").toString().toLowerCase();
    if (!email.includes("@")) throw new BadRequestException("The IdP didn't provide a usable email address");
    if (email.split("@")[1] !== company.ssoDomain) {
      throw new BadRequestException("The signed-in email doesn't match this company's SSO domain");
    }

    let user = await this.prisma.user.findUnique({
      where: { email },
      include: { memberships: { where: { companyId }, include: { customRole: true } } },
    });
    if (user && user.memberships.length === 0) {
      throw new BadRequestException("This email belongs to an account in a different company — contact your administrator");
    }

    if (!user) {
      // SSO-provisioned users never set a password — a random, never-communicated hash keeps
      // User.passwordHash satisfied without making password login guessable or nullable schema-wide.
      const passwordHash = await bcrypt.hash(randomBytes(32).toString("hex"), 12);
      const created = await this.prisma.user.create({
        data: {
          email,
          passwordHash,
          name: (profile?.["displayName"] as string | undefined) ?? email,
          memberships: { create: { companyId, role: "worker" } },
        },
        include: { memberships: { where: { companyId }, include: { customRole: true } } },
      });
      user = created;
      this.audit.record(companyId, { name: "SSO" }, "sso.user_provisioned", "User", created.id, `Provisioned ${email} via SSO`);
    }

    const membership = user.memberships[0];
    const sid = await this.sessions.create(user.id, meta);
    const accessToken = this.jwt.sign({
      userId: user.id,
      companyId,
      email: user.email,
      name: user.name,
      role: membership.role,
      additionalRoles: membership.customRole?.basePermissions,
      sid,
    } satisfies AuthUser);

    return { accessToken };
  }

  private buildSaml(
    companyId: string,
    idp: { ssoEntryPoint?: string; ssoIssuer?: string; ssoCert: string },
  ): SAML {
    const apiOrigin = this.config.get<string>("API_ORIGIN") ?? "http://localhost:4000/api";
    return new SAML({
      entryPoint: idp.ssoEntryPoint,
      idpIssuer: idp.ssoIssuer,
      idpCert: idp.ssoCert,
      issuer: `${apiOrigin}/auth/sso/metadata/${companyId}`,
      callbackUrl: `${apiOrigin}/auth/sso/acs/${companyId}`,
      wantAssertionsSigned: true,
      wantAuthnResponseSigned: false,
      identifierFormat: null,
    });
  }
}
