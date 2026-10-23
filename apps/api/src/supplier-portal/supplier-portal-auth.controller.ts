import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import {
  requestSupplierPortalLinkSchema,
  verifySupplierPortalTokenSchema,
  type RequestSupplierPortalLinkInput,
  type VerifySupplierPortalTokenInput,
} from "@cantero/shared";
import { Public } from "../common/decorators/public.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { SupplierPortalAuthService } from "./supplier-portal-auth.service";
import { SupplierPortalAuthGuard } from "./supplier-portal-auth.guard";
import { CurrentPortalSupplier } from "./current-portal-supplier.decorator";
import type { PortalSupplierContext } from "./supplier-portal-jwt.service";

/** Unauthenticated by design — this IS the login flow for the supplier portal (logout carries its own guard). */
@Public()
@Controller("supplier-portal/auth")
export class SupplierPortalAuthController {
  constructor(private readonly service: SupplierPortalAuthService) {}

  @Post("request-link")
  requestLink(@Body(new ZodValidationPipe(requestSupplierPortalLinkSchema)) body: RequestSupplierPortalLinkInput, @Req() req: Request) {
    return this.service.requestLink(body.email, req.ip);
  }

  @Post("verify")
  verify(@Body(new ZodValidationPipe(verifySupplierPortalTokenSchema)) body: VerifySupplierPortalTokenInput) {
    return this.service.verify(body.token);
  }

  /** The portal's "Sign out": retires this supplier's portal tokens, not just the one in this browser. */
  @UseGuards(SupplierPortalAuthGuard)
  @Post("logout")
  logout(@CurrentPortalSupplier() portal: PortalSupplierContext) {
    return this.service.logout(portal);
  }
}
