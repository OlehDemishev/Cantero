import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";

/** A week rather than the old 30 days: portal tokens sit in localStorage, often on a shared or
 * personal device, and a new magic link is one email away. */
const PORTAL_TOKEN_TTL = "7d";

export interface SubcontractorPortalJwtPayload {
  sub: string;
  companyId: string;
  kind: "subcontractor-portal";
  /** The holder's portalTokenVersion when this was issued — absent on tokens from before it existed (read as 0). */
  ver?: number;
}

export interface PortalSubcontractorContext {
  subcontractorId: string;
  companyId: string;
}

/** Signs/verifies subcontractor-portal session tokens with a secret separate from both the internal-user and client-portal JWTs. */
@Injectable()
export class SubcontractorPortalJwtService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private get secret(): string {
    return this.config.get<string>("SUBCONTRACTOR_PORTAL_JWT_SECRET") ?? this.config.getOrThrow<string>("JWT_SECRET");
  }

  sign(payload: { subcontractorId: string; companyId: string; tokenVersion: number }): string {
    return this.jwt.sign(
      { sub: payload.subcontractorId, companyId: payload.companyId, kind: "subcontractor-portal", ver: payload.tokenVersion },
      { secret: this.secret, expiresIn: PORTAL_TOKEN_TTL },
    );
  }

  /** Signature, expiry and kind only — the guard then checks the holder still exists and hasn't signed out since. */
  async verify(token: string): Promise<PortalSubcontractorContext & { tokenVersion: number }> {
    const payload = await this.jwt.verifyAsync<SubcontractorPortalJwtPayload>(token, { secret: this.secret });
    if (payload.kind !== "subcontractor-portal") throw new Error("wrong token kind");
    return { subcontractorId: payload.sub, companyId: payload.companyId, tokenVersion: payload.ver ?? 0 };
  }
}
