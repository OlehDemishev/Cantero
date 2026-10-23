import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { EXPLICIT_API_KEY_SCOPES, type ApiKeyScope } from "@cantero/shared";
import { PrismaService } from "../prisma/prisma.service";
import { hashApiKey } from "../../company/api-keys.service";
import { REQUIRE_SCOPE_KEY } from "../decorators/require-scope.decorator";

/** Authenticates /v1/* integration routes via the X-Api-Key header instead of a JWT, and — when
 * the route or its controller carries @RequireScope() — checks the key was issued with that scope.
 * An unscoped key passes every read scope, never an explicit one (SCIM). */
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

    const requiredScope = this.reflector.getAllAndOverride<ApiKeyScope | undefined>(REQUIRE_SCOPE_KEY, [context.getHandler(), context.getClass()]);
    if (requiredScope && !ApiKeyGuard.allows(apiKey.scopes, requiredScope)) {
      throw new ForbiddenException(`This API key is not scoped for "${requiredScope}"`);
    }

    this.prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
    request.companyId = apiKey.companyId;
    request.apiKeyScopes = apiKey.scopes;
    request.apiKeyName = apiKey.name;
    return true;
  }

  static allows(keyScopes: readonly string[], required: ApiKeyScope): boolean {
    if (keyScopes.includes(required)) return true;
    return keyScopes.length === 0 && !EXPLICIT_API_KEY_SCOPES.includes(required);
  }
}
