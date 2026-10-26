import { randomBytes } from "node:crypto";
import { BadRequestException, HttpException, HttpStatus, Injectable, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import type { ScimCreateUserInput, ScimPatchUserInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { SessionsService } from "../common/sessions/sessions.service";
import { runSerializable } from "../common/prisma/serializable-transaction";
import { assertSeatAvailable } from "../company/invites.service";

const BCRYPT_ROUNDS = 12;

interface MembershipWithUser {
  userId: string;
  role: string;
  user: { id: string; email: string; name: string };
}

/** An error in the SCIM shape (RFC 7644 §3.12), which IdPs read `scimType`/`detail` from. */
export function scimError(status: HttpStatus, detail: string, scimType?: string): HttpException {
  return new HttpException(
    { schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"], status: String(status), ...(scimType ? { scimType } : {}), detail },
    status,
  );
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
    // An account that already exists is never attached from here: it may belong to another
    // company, and its owner hasn't agreed to join this one. They can be invited instead.
    const existingUser = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existingUser) {
      const existingMembership = await this.prisma.membership.findFirst({ where: { userId: existingUser.id, companyId } });
      throw scimError(
        HttpStatus.CONFLICT,
        existingMembership
          ? "This person is already provisioned in this company"
          : "An account with this email already exists — invite the person instead of provisioning them",
        "uniqueness",
      );
    }

    const name = [input.name?.givenName, input.name?.familyName].filter(Boolean).join(" ") || email.split("@")[0];
    const passwordHash = await bcrypt.hash(randomBytes(32).toString("hex"), BCRYPT_ROUNDS);

    // Serializable, like accepting an invite, so two concurrent provisions can't both take the last seat.
    const { membership } = await runSerializable(this.prisma, async (tx) => {
      try {
        await assertSeatAvailable(tx, companyId);
      } catch (err) {
        if (err instanceof BadRequestException) throw scimError(HttpStatus.FORBIDDEN, err.message);
        throw err;
      }
      const user = await tx.user.create({ data: { email, name, passwordHash } });
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
   * equivalent it can offer today. Their sessions in other companies are left alone — this
   * company's IdP has no say there. A real integration would want a proper account-status field.
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
      await this.sessions.revokeAllInCompany(userId, companyId);
    }

    return toScimUser(membership);
  }
}
