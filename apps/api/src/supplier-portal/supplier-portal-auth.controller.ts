import { Body, Controller, Post } from "@nestjs/common";
import {
  requestSupplierPortalLinkSchema,
  verifySupplierPortalTokenSchema,
  type RequestSupplierPortalLinkInput,
  type VerifySupplierPortalTokenInput,
} from "@cantero/shared";
import { Public } from "../common/decorators/public.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { SupplierPortalAuthService } from "./supplier-portal-auth.service";

/** Unauthenticated by design — this IS the login flow for the supplier portal. */
@Public()
@Controller("supplier-portal/auth")
export class SupplierPortalAuthController {
  constructor(private readonly service: SupplierPortalAuthService) {}

  @Post("request-link")
  requestLink(@Body(new ZodValidationPipe(requestSupplierPortalLinkSchema)) body: RequestSupplierPortalLinkInput) {
    return this.service.requestLink(body.email);
  }

  @Post("verify")
  verify(@Body(new ZodValidationPipe(verifySupplierPortalTokenSchema)) body: VerifySupplierPortalTokenInput) {
    return this.service.verify(body.token);
  }
}
