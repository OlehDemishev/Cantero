import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";

export interface SupplierPortalJwtPayload {
  sub: string;
  companyId: string;
  kind: "supplier-portal";
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

  sign(payload: { supplierId: string; companyId: string }): string {
    return this.jwt.sign(
      { sub: payload.supplierId, companyId: payload.companyId, kind: "supplier-portal" },
      { secret: this.secret, expiresIn: "30d" },
    );
  }

  async verify(token: string): Promise<PortalSupplierContext> {
    const payload = await this.jwt.verifyAsync<SupplierPortalJwtPayload>(token, { secret: this.secret });
    if (payload.kind !== "supplier-portal") throw new Error("wrong token kind");
    return { supplierId: payload.sub, companyId: payload.companyId };
  }
}
