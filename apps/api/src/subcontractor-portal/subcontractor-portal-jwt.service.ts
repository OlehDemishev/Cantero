import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";

export interface SubcontractorPortalJwtPayload {
  sub: string;
  companyId: string;
  kind: "subcontractor-portal";
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

  sign(payload: { subcontractorId: string; companyId: string }): string {
    return this.jwt.sign(
      { sub: payload.subcontractorId, companyId: payload.companyId, kind: "subcontractor-portal" },
      { secret: this.secret, expiresIn: "30d" },
    );
  }

  async verify(token: string): Promise<PortalSubcontractorContext> {
    const payload = await this.jwt.verifyAsync<SubcontractorPortalJwtPayload>(token, { secret: this.secret });
    if (payload.kind !== "subcontractor-portal") throw new Error("wrong token kind");
    return { subcontractorId: payload.sub, companyId: payload.companyId };
  }
}
