import { randomBytes } from "node:crypto";
import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import type { ScimCreateUserInput, ScimPatchUserInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { SessionsService } from "../common/sessions/sessions.service";

const BCRYPT_ROUNDS = 12;

interface MembershipWithUser {
  userId: string;
  role: string;
  user: { id: string; email: string; name: string };
}

function toScimUser(membership: MembershipWithUser) {
  const [givenName, ...rest] = membership.user.name.split(" ");
  return {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
    id: membership.userId,
    userName: membership.user.email,
    name: { givenName, familyName: rest.join(" ") || undefined },
    emails: [{ value: membership.user.email, primary: true }],
    active: true,
  };
}

/**
 * Minimal SCIM 2.0 User provisioning — shape and auth (company API key) only, no IdP is actually
 * connected. A SCIM-created user is passwordless like an SSO user (a random unusable hash), since
 * real SCIM provisioning implies the IdP owns authentication, not this app's own login form.
 */
@Injectable()
export class ScimService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
  ) {}

  async listUsers(companyId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { companyId },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    const resources = memberships.map(toScimUser);
    return {
      schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
      totalResults: resources.length,
      Resources: resources,
    };
  }

  async createUser(companyId: string, input: ScimCreateUserInput) {
    const email = input.emails?.find((e) => e.primary)?.value ?? input.emails?.[0]?.value ?? input.userName;
    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      const existingMembership = await this.prisma.membership.findFirst({ where: { userId: existingUser.id, companyId } });
      if (existingMembership) throw new ConflictException("This person is already provisioned in this company");
    }

    const name = [input.name?.givenName, input.name?.familyName].filter(Boolean).join(" ") || email.split("@")[0];
    const passwordHash = await bcrypt.hash(randomBytes(32).toString("hex"), BCRYPT_ROUNDS);

    const { membership } = await this.prisma.$transaction(async (tx) => {
      const user = existingUser ?? (await tx.user.create({ data: { email, name, passwordHash } }));
      const membership = await tx.membership.create({
        data: { userId: user.id, companyId, role: "worker" },
        include: { user: { select: { id: true, email: true, name: true } } },
      });
      return { membership };
    });

    return toScimUser(membership);
  }

  /**
   * This system has no "disabled account" flag on User/Membership — deactivation is mapped to
   * signing out every active session for that user in this company's context, the closest
   * equivalent it can offer today. A real integration would want a proper account-status field.
   */
  async patchUser(companyId: string, userId: string, input: ScimPatchUserInput) {
    const membership = await this.prisma.membership.findFirst({
      where: { userId, companyId },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    if (!membership) throw new NotFoundException("User not found in this company");

    // Okta sends {path: "active", value: false}; Azure AD sometimes omits path and sends
    // {value: {active: false}} instead — both are handled here.
    const deactivate = input.Operations.some((op) => {
      if (op.path === "active") return op.value === false;
      if (typeof op.value === "object" && op.value !== null && "active" in op.value) {
        return (op.value as { active: unknown }).active === false;
      }
      return false;
    });
    if (deactivate) {
      const sessions = await this.sessions.list(userId);
      await Promise.all(sessions.map((s) => this.sessions.revoke(userId, s.id)));
    }

    return toScimUser(membership);
  }
}
