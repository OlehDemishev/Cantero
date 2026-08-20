import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { hashApiKey } from "../../company/api-keys.service";

/** Authenticates /v1/* integration routes via the X-Api-Key header instead of a JWT. */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const header = request.headers["x-api-key"];
    const key = Array.isArray(header) ? header[0] : header;
    if (!key) throw new UnauthorizedException("Missing X-Api-Key header");

    const apiKey = await this.prisma.apiKey.findFirst({
      where: { keyHash: hashApiKey(key), revokedAt: null },
    });
    if (!apiKey) throw new UnauthorizedException("Invalid or revoked API key");

    this.prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
    request.companyId = apiKey.companyId;
    return true;
  }
}
