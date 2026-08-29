import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { ApiKeyScope } from "@cantero/shared";

/** The scopes the authenticating API key was issued with — see ApiKeyGuard. An empty array means
 * unrestricted (every resource), matching how @RequireScope() already treats an empty scopes list. */
export const ApiKeyScopes = createParamDecorator((_data: unknown, ctx: ExecutionContext): ApiKeyScope[] => {
  const request = ctx.switchToHttp().getRequest();
  return request.apiKeyScopes ?? [];
});
