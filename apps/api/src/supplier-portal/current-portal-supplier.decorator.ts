import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { PortalSupplierContext } from "./supplier-portal-jwt.service";

export const CurrentPortalSupplier = createParamDecorator((_data: unknown, ctx: ExecutionContext): PortalSupplierContext => {
  const request = ctx.switchToHttp().getRequest();
  return request.portalSupplier;
});
