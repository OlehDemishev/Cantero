import { BadRequestException, Body, Controller, Get, Headers, Post, RawBodyRequest, Req } from "@nestjs/common";
import type { Request } from "express";
import { changePlanSchema, updateSeatsSchema, type AuthUser, type ChangePlanInput, type UpdateSeatsInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Public } from "../common/decorators/public.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { SkipSubscriptionCheck } from "../common/decorators/skip-subscription-check.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { BillingService } from "./billing.service";

@Controller("billing")
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @SkipSubscriptionCheck()
  @Post("checkout-session")
  createCheckoutSession(@CurrentUser() user: AuthUser) {
    return this.billingService.createCheckoutSession(user.companyId, user.email);
  }

  @SkipSubscriptionCheck()
  @Get("plans")
  listPlans() {
    return this.billingService.listPlans();
  }

  @SkipSubscriptionCheck()
  @Get("subscription")
  getSubscription(@CurrentUser() user: AuthUser) {
    return this.billingService.getSubscription(user.companyId);
  }

  @Roles("owner", "admin")
  @Post("change-plan")
  changePlan(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(changePlanSchema)) body: ChangePlanInput) {
    return this.billingService.changePlan(user.companyId, body.planCode);
  }

  @Roles("owner", "admin")
  @Post("seats")
  updateSeats(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(updateSeatsSchema)) body: UpdateSeatsInput) {
    return this.billingService.updateSeats(user.companyId, body.seats);
  }

  @Public()
  @Post("webhook")
  async webhook(@Req() req: RawBodyRequest<Request>, @Headers("stripe-signature") signature: string) {
    if (!req.rawBody || !signature) throw new BadRequestException("Missing Stripe signature or raw body");
    const event = this.billingService.constructWebhookEvent(req.rawBody, signature);
    await this.billingService.handleWebhookEvent(event);
    return { received: true };
  }
}
