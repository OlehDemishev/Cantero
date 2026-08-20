import { Body, Controller, Post } from "@nestjs/common";
import { requestPortalLinkSchema, verifyPortalTokenSchema, type RequestPortalLinkInput, type VerifyPortalTokenInput } from "@cantero/shared";
import { Public } from "../common/decorators/public.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { PortalAuthService } from "./portal-auth.service";

/** Unauthenticated by design — this IS the login flow for the client portal. */
@Public()
@Controller("portal/auth")
export class PortalAuthController {
  constructor(private readonly service: PortalAuthService) {}

  @Post("request-link")
  requestLink(@Body(new ZodValidationPipe(requestPortalLinkSchema)) body: RequestPortalLinkInput) {
    return this.service.requestLink(body.email);
  }

  @Post("verify")
  verify(@Body(new ZodValidationPipe(verifyPortalTokenSchema)) body: VerifyPortalTokenInput) {
    return this.service.verify(body.token);
  }
}
