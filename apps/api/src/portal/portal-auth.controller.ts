import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { requestPortalLinkSchema, verifyPortalTokenSchema, type RequestPortalLinkInput, type VerifyPortalTokenInput } from "@cantero/shared";
import { Public } from "../common/decorators/public.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { PortalAuthService } from "./portal-auth.service";
import { PortalAuthGuard } from "./portal-auth.guard";
import { CurrentPortalClient } from "./current-portal-client.decorator";
import type { PortalClientContext } from "./portal-jwt.service";

/** Unauthenticated by design — this IS the login flow for the client portal (logout carries its own guard). */
@Public()
@Controller("portal/auth")
export class PortalAuthController {
  constructor(private readonly service: PortalAuthService) {}

  @Post("request-link")
  requestLink(@Body(new ZodValidationPipe(requestPortalLinkSchema)) body: RequestPortalLinkInput, @Req() req: Request) {
    return this.service.requestLink(body.email, req.ip);
  }

  @Post("verify")
  verify(@Body(new ZodValidationPipe(verifyPortalTokenSchema)) body: VerifyPortalTokenInput) {
    return this.service.verify(body.token);
  }

  /** The portal's "Sign out": retires this client's portal tokens, not just the one in this browser. */
  @UseGuards(PortalAuthGuard)
  @Post("logout")
  logout(@CurrentPortalClient() portal: PortalClientContext) {
    return this.service.logout(portal);
  }
}
