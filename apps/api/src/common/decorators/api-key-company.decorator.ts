import { createParamDecorator, ExecutionContext } from "@nestjs/common";

/** The companyId resolved by ApiKeyGuard from the X-Api-Key header. */
export const ApiKeyCompanyId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest();
  return request.companyId;
});
