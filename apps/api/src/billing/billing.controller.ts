import { BadRequestException, Body, Controller, Get, Headers, Post, RawBodyRequest, Req } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import { changePlanSchema, updateSeatsSchema, type AuthUser, type ChangePlanInput, type UpdateSeatsInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Public } from "../common/decorators/public.decorator";
import { OpenToAllRoles, Roles } from "../common/decorators/roles.decorator";
import { SkipSubscriptionCheck } from "../common/decorators/skip-subscription-check.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { BillingService } from "./billing.service";
import { StripeConnectService } from "../finance/stripe-connect.service";

@OpenToAllRoles("every member may see the plan and whether the subscription is active")
@Controller("billing")
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly config: ConfigService,
    private readonly stripeConnect: StripeConnectService,
  ) {}

  @Roles("owner", "admin")
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

  @SkipSubscriptionCheck()
  @Roles("owner", "admin")
  @Post("portal-session")
  createPortalSession(@CurrentUser() user: AuthUser) {
    const webOrigin = this.config.get<string>("WEB_ORIGIN") ?? "http://localhost:3000";
    return this.billingService.createPortalSession(user.companyId, `${webOrigin}/settings`);
  }

  /** Where the company's clients' invoice payments go — its own Stripe account (Stripe Connect). */
  @SkipSubscriptionCheck()
  @Roles("owner", "admin")
  @Get("stripe-connect")
  stripeConnectStatus(@CurrentUser() user: AuthUser) {
    return this.stripeConnect.status(user.companyId);
  }

  @SkipSubscriptionCheck()
  @Roles("owner", "admin")
  @Post("stripe-connect/onboarding-link")
  stripeConnectOnboardingLink(@CurrentUser() user: AuthUser) {
    return this.stripeConnect.createOnboardingLink(user.companyId, user.email);
  }

  /** Stripe Connect endpoint: events on companies' connected accounts, signed with
   * STRIPE_CONNECT_WEBHOOK_SECRET (a separate endpoint in the Stripe dashboard, "Listen to events
   * on Connected accounts"). */
  @Public()
  @Post("connect-webhook")
  async connectWebhook(@Req() req: RawBodyRequest<Request>, @Headers("stripe-signature") signature: string) {
    if (!req.rawBody || !signature) throw new BadRequestException("Missing Stripe signature or raw body");
    const event = this.billingService.constructWebhookEvent(req.rawBody, signature, "connect");
    await this.billingService.handleConnectWebhookEvent(event);
    return { received: true };
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
