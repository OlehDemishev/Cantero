import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { ApiKeyScope } from "@cantero/shared";
import { PrismaService } from "../prisma/prisma.service";
import { hashApiKey } from "../../company/api-keys.service";
import { REQUIRE_SCOPE_KEY } from "../decorators/require-scope.decorator";

/** Authenticates /v1/* integration routes via the X-Api-Key header instead of a JWT, and — when
 * the route carries @RequireScope() — checks the key was issued with that scope. */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const header = request.headers["x-api-key"];
    const key = Array.isArray(header) ? header[0] : header;
    if (!key) throw new UnauthorizedException("Missing X-Api-Key header");

    const apiKey = await this.prisma.apiKey.findFirst({
      where: { keyHash: hashApiKey(key), revokedAt: null },
    });
    if (!apiKey) throw new UnauthorizedException("Invalid or revoked API key");
    if (apiKey.expiresAt && apiKey.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException("API key has expired");
    }

    const requiredScope = this.reflector.get<ApiKeyScope | undefined>(REQUIRE_SCOPE_KEY, context.getHandler());
    if (requiredScope && apiKey.scopes.length > 0 && !apiKey.scopes.includes(requiredScope)) {
      throw new ForbiddenException(`This API key is not scoped for "${requiredScope}"`);
    }

    this.prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
    request.companyId = apiKey.companyId;
    return true;
  }
}
