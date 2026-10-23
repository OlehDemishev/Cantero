import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";

/** A week rather than the old 30 days: portal tokens sit in localStorage, often on a shared or
 * personal device, and a new magic link is one email away. */
const PORTAL_TOKEN_TTL = "7d";

export interface SupplierPortalJwtPayload {
  sub: string;
  companyId: string;
  kind: "supplier-portal";
  /** The holder's portalTokenVersion when this was issued — absent on tokens from before it existed (read as 0). */
  ver?: number;
}

export interface PortalSupplierContext {
  supplierId: string;
  companyId: string;
}

/** Signs/verifies supplier-portal session tokens with a secret separate from the internal-user,
 * client-portal, and subcontractor-portal JWTs — mirrors SubcontractorPortalJwtService. */
@Injectable()
export class SupplierPortalJwtService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private get secret(): string {
    return this.config.get<string>("SUPPLIER_PORTAL_JWT_SECRET") ?? this.config.getOrThrow<string>("JWT_SECRET");
  }

  sign(payload: { supplierId: string; companyId: string; tokenVersion: number }): string {
    return this.jwt.sign(
      { sub: payload.supplierId, companyId: payload.companyId, kind: "supplier-portal", ver: payload.tokenVersion },
      { secret: this.secret, expiresIn: PORTAL_TOKEN_TTL },
    );
  }

  /** Signature, expiry and kind only — the guard then checks the holder still exists and hasn't signed out since. */
  async verify(token: string): Promise<PortalSupplierContext & { tokenVersion: number }> {
    const payload = await this.jwt.verifyAsync<SupplierPortalJwtPayload>(token, { secret: this.secret });
    if (payload.kind !== "supplier-portal") throw new Error("wrong token kind");
    return { supplierId: payload.sub, companyId: payload.companyId, tokenVersion: payload.ver ?? 0 };
  }
}
