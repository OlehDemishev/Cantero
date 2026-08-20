import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { PortalSubcontractorContext } from "./subcontractor-portal-jwt.service";

export const CurrentPortalSubcontractor = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PortalSubcontractorContext => {
    const request = ctx.switchToHttp().getRequest();
    return request.portalSubcontractor;
  },
);
