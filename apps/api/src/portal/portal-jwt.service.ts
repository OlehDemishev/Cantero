import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";

/** A week rather than the old 30 days: portal tokens sit in localStorage, often on a shared or
 * personal device, and a new magic link is one email away. */
const PORTAL_TOKEN_TTL = "7d";

export interface PortalJwtPayload {
  sub: string;
  companyId: string;
  kind: "client-portal";
  /** The holder's portalTokenVersion when this was issued — absent on tokens from before it existed (read as 0). */
  ver?: number;
}

export interface PortalClientContext {
  clientId: string;
  companyId: string;
}

/** Signs/verifies client-portal session tokens with a secret separate from the internal-user JWT (see jwt-auth.guard.ts). */
@Injectable()
export class PortalJwtService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private get secret(): string {
    return this.config.get<string>("PORTAL_JWT_SECRET") ?? this.config.getOrThrow<string>("JWT_SECRET");
  }

  sign(payload: { clientId: string; companyId: string; tokenVersion: number }): string {
    return this.jwt.sign(
      { sub: payload.clientId, companyId: payload.companyId, kind: "client-portal", ver: payload.tokenVersion },
      { secret: this.secret, expiresIn: PORTAL_TOKEN_TTL },
    );
  }

  /** Signature, expiry and kind only — the guard then checks the holder still exists and hasn't signed out since. */
  async verify(token: string): Promise<PortalClientContext & { tokenVersion: number }> {
    const payload = await this.jwt.verifyAsync<PortalJwtPayload>(token, { secret: this.secret });
    if (payload.kind !== "client-portal") throw new Error("wrong token kind");
    return { clientId: payload.sub, companyId: payload.companyId, tokenVersion: payload.ver ?? 0 };
  }
}
