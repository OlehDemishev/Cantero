import { Body, Controller, Post } from "@nestjs/common";
import {
  requestSubcontractorPortalLinkSchema,
  verifySubcontractorPortalTokenSchema,
  type RequestSubcontractorPortalLinkInput,
  type VerifySubcontractorPortalTokenInput,
} from "@cantero/shared";
import { Public } from "../common/decorators/public.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { SubcontractorPortalAuthService } from "./subcontractor-portal-auth.service";

/** Unauthenticated by design — this IS the login flow for the subcontractor portal. */
@Public()
@Controller("subcontractor-portal/auth")
export class SubcontractorPortalAuthController {
  constructor(private readonly service: SubcontractorPortalAuthService) {}

  @Post("request-link")
  requestLink(@Body(new ZodValidationPipe(requestSubcontractorPortalLinkSchema)) body: RequestSubcontractorPortalLinkInput) {
    return this.service.requestLink(body.email);
  }

  @Post("verify")
  verify(@Body(new ZodValidationPipe(verifySubcontractorPortalTokenSchema)) body: VerifySubcontractorPortalTokenInput) {
    return this.service.verify(body.token);
  }
}
