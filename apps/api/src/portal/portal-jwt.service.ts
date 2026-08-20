import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";

export interface PortalJwtPayload {
  sub: string;
  companyId: string;
  kind: "client-portal";
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

  sign(payload: { clientId: string; companyId: string }): string {
    return this.jwt.sign(
      { sub: payload.clientId, companyId: payload.companyId, kind: "client-portal" },
      { secret: this.secret, expiresIn: "30d" },
    );
  }

  async verify(token: string): Promise<PortalClientContext> {
    const payload = await this.jwt.verifyAsync<PortalJwtPayload>(token, { secret: this.secret });
    if (payload.kind !== "client-portal") throw new Error("wrong token kind");
    return { clientId: payload.sub, companyId: payload.companyId };
  }
}
