import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Stripe from "stripe";
import { PrismaService } from "../common/prisma/prisma.service";

export interface StripeConnectStatus {
  connected: boolean;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
}

/**
 * Stripe Connect (Standard accounts, direct charges): each company's clients pay into that
 * company's own Stripe account. Every invoice Checkout, saved payment method and autopay charge is
 * created with `{ stripeAccount }` set to Company.stripeAccountId, so the money, the fees and any
 * dispute belong to the contractor who issued the invoice — the platform account never holds a
 * client's payment. The platform account keeps only the company's own Cantero subscription
 * (BillingService).
 *
 * Events for objects on a connected account arrive on the Connect webhook endpoint with
 * `event.account` set. The owner of a connected account can create objects on it with any
 * metadata they like, so an event's metadata.companyId is only trusted once accountBelongsTo()
 * confirms that the event's account is that company's own.
 */
@Injectable()
export class StripeConnectService {
  private readonly logger = new Logger(StripeConnectService.name);
  private readonly stripe: Stripe;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.stripe = new Stripe(this.config.getOrThrow<string>("STRIPE_SECRET_KEY"));
  }

  /** A Stripe-hosted onboarding link for the company's own account, creating the account first if
   * it has none. Calling it again resumes an unfinished onboarding on the same account. */
  async createOnboardingLink(companyId: string, email: string): Promise<{ url: string }> {
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { name: true, country: true, stripeAccountId: true },
    });

    let accountId = company.stripeAccountId;
    if (!accountId) {
      const account = await this.callStripe(() =>
        this.stripe.accounts.create(
          { type: "standard", country: company.country, email, business_profile: { name: company.name }, metadata: { companyId } },
          // Two admins clicking "Connect" at once get the same account back rather than two.
          { idempotencyKey: `connect-account-${companyId}` },
        ),
      );
      await this.prisma.company.updateMany({ where: { id: companyId, stripeAccountId: null }, data: { stripeAccountId: account.id } });
      accountId = (await this.prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { stripeAccountId: true } })).stripeAccountId!;
    }

    const webOrigin = this.config.get<string>("WEB_ORIGIN") ?? "http://localhost:3000";
    const link = await this.callStripe(() =>
      this.stripe.accountLinks.create({
        account: accountId,
        type: "account_onboarding",
        refresh_url: `${webOrigin}/settings?tab=billing&stripe=refresh`,
        return_url: `${webOrigin}/settings?tab=billing&stripe=return`,
      }),
    );
    return { url: link.url };
  }

  /** Reads the account from Stripe (not just the stored flag) so Settings shows the truth right
   * after the admin returns from onboarding, before account.updated has necessarily arrived. */
  async status(companyId: string): Promise<StripeConnectStatus> {
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { stripeAccountId: true } });
    if (!company.stripeAccountId) return { connected: false, chargesEnabled: false, detailsSubmitted: false };
    const account = await this.callStripe(() => this.stripe.accounts.retrieve(company.stripeAccountId!));
    await this.handleAccountUpdated(account);
    return { connected: true, chargesEnabled: account.charges_enabled, detailsSubmitted: account.details_submitted };
  }

  async handleAccountUpdated(account: Stripe.Account): Promise<void> {
    await this.prisma.company.updateMany({
      where: { stripeAccountId: account.id },
      data: { stripeChargesEnabled: account.charges_enabled },
    });
  }

  /** The company disconnected Cantero from its Stripe account — nothing can be charged there any more. */
  async handleDeauthorized(accountId: string): Promise<void> {
    const { count } = await this.prisma.company.updateMany({
      where: { stripeAccountId: accountId },
      data: { stripeAccountId: null, stripeChargesEnabled: false },
    });
    if (count > 0) this.logger.warn(`Stripe account ${accountId} disconnected from Cantero`);
  }

  /** The account a company's clients can be charged on, or a 400 explaining that online payment
   * isn't set up — never a fallback to the platform account. */
  async chargeableAccountFor(companyId: string): Promise<string> {
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { stripeAccountId: true, stripeChargesEnabled: true },
    });
    if (!company.stripeAccountId || !company.stripeChargesEnabled) {
      throw new BadRequestException("Online payment isn't set up for this company yet — connect a Stripe account in Settings → Billing");
    }
    return company.stripeAccountId;
  }

  async accountBelongsTo(accountId: string, companyId: string): Promise<boolean> {
    const company = await this.prisma.company.findUnique({ where: { id: companyId }, select: { stripeAccountId: true } });
    return !!company && company.stripeAccountId === accountId;
  }

  /** Stripe's own validation errors (unsupported country, incomplete profile, ...) are the
   * caller's to fix, so they surface as a 400 with Stripe's message instead of a bare 500. */
  private async callStripe<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof Stripe.errors.StripeInvalidRequestError) throw new BadRequestException(err.message);
      throw err;
    }
  }
}
