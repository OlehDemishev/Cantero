import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import {
  requestSubcontractorPortalLinkSchema,
  verifySubcontractorPortalTokenSchema,
  type RequestSubcontractorPortalLinkInput,
  type VerifySubcontractorPortalTokenInput,
} from "@cantero/shared";
import { Public } from "../common/decorators/public.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { SubcontractorPortalAuthService } from "./subcontractor-portal-auth.service";
import { SubcontractorPortalAuthGuard } from "./subcontractor-portal-auth.guard";
import { CurrentPortalSubcontractor } from "./current-portal-subcontractor.decorator";
import type { PortalSubcontractorContext } from "./subcontractor-portal-jwt.service";

/** Unauthenticated by design — this IS the login flow for the subcontractor portal (logout carries its own guard). */
@Public()
@Controller("subcontractor-portal/auth")
export class SubcontractorPortalAuthController {
  constructor(private readonly service: SubcontractorPortalAuthService) {}

  @Post("request-link")
  requestLink(@Body(new ZodValidationPipe(requestSubcontractorPortalLinkSchema)) body: RequestSubcontractorPortalLinkInput, @Req() req: Request) {
    return this.service.requestLink(body.email, req.ip);
  }

  @Post("verify")
  verify(@Body(new ZodValidationPipe(verifySubcontractorPortalTokenSchema)) body: VerifySubcontractorPortalTokenInput) {
    return this.service.verify(body.token);
  }

  /** The portal's "Sign out": retires this subcontractor's portal tokens, not just the one in this browser. */
  @UseGuards(SubcontractorPortalAuthGuard)
  @Post("logout")
  logout(@CurrentPortalSubcontractor() portal: PortalSubcontractorContext) {
    return this.service.logout(portal);
  }
}
