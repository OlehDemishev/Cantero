import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { PortalClientContext } from "./portal-jwt.service";

export const CurrentPortalClient = createParamDecorator((_data: unknown, ctx: ExecutionContext): PortalClientContext => {
  const request = ctx.switchToHttp().getRequest();
  return request.portalClient;
});
