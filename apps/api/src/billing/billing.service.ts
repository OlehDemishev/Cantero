import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Stripe from "stripe";
import { PrismaService } from "../common/prisma/prisma.service";
import { InvoicesService } from "../finance/invoices.service";
import { ClientPaymentMethodsService } from "../finance/client-payment-methods.service";

const STRIPE_PAYMENT_ACTOR = { userId: "stripe", name: "Online payment" };

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly stripe: Stripe;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly invoices: InvoicesService,
    private readonly clientPaymentMethods: ClientPaymentMethodsService,
  ) {
    this.stripe = new Stripe(this.config.getOrThrow<string>("STRIPE_SECRET_KEY"));
  }

  /** A Stripe Customer Billing Portal session so the company admin can update their payment
   * method, view past invoices, and download receipts without us building any of that UI. */
  async createPortalSession(companyId: string, returnUrl: string): Promise<{ url: string }> {
    const subscription = await this.prisma.subscription.findUniqueOrThrow({ where: { companyId } });
    if (!subscription.stripeCustomerId) {
      throw new BadRequestException("No billing account yet — complete checkout first");
    }
    const session = await this.stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: returnUrl,
    });
    return { url: session.url };
  }

  /** A one-off Stripe Checkout session (mode "payment", not "subscription") that lets a client
   * pay a single invoice online by card. Recorded as a Payment once the webhook confirms it. */
  /**
   * `requestedAmount`, when given (e.g. paying one InvoiceInstallment instead of the full
   * balance), is capped at the remaining balance so a stale/tampered amount can never charge more
   * than what's actually owed — it can only ever reduce the checkout below the full balance.
   */
  async createInvoiceCheckoutSession(
    companyId: string,
    invoiceId: string,
    clientEmail: string | undefined,
    requestedAmount?: number,
  ): Promise<{ url: string }> {
    const invoice = await this.prisma.invoice.findFirstOrThrow({ where: { id: invoiceId, companyId } });
    if (invoice.status !== "sent") {
      throw new BadRequestException("This invoice isn't open for payment");
    }

    const paid = await this.prisma.payment.aggregate({ where: { invoiceId }, _sum: { amount: true } });
    const balance = Number(invoice.total) - Number(paid._sum.amount ?? 0);
    if (balance <= 0) {
      throw new BadRequestException("This invoice is already paid in full");
    }
    const amountToCharge = requestedAmount !== undefined ? Math.min(Math.max(requestedAmount, 0.01), balance) : balance;

    const webOrigin = this.config.get<string>("PORTAL_ORIGIN") ?? this.config.get<string>("WEB_ORIGIN") ?? "http://localhost:3000";
    const session = await this.stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: clientEmail,
      line_items: [
        {
          price_data: {
            // The invoice's own currency, never the company's default — an invoice can be issued
            // in a different currency than the company (see Project.currency), and charging in
            // the wrong one would collect the right *number* in the wrong money.
            currency: invoice.currency.toLowerCase(),
            unit_amount: Math.round(amountToCharge * 100),
            product_data: { name: `Invoice ${invoice.number}` },
          },
          quantity: 1,
        },
      ],
      success_url: `${webOrigin}/portal/invoices/${invoiceId}?paid=1`,
      cancel_url: `${webOrigin}/portal/invoices/${invoiceId}`,
      metadata: { companyId, invoiceId, kind: "invoice_payment" },
    });

    if (!session.url) throw new Error("Stripe did not return a checkout URL");
    return { url: session.url };
  }

  async createCheckoutSession(companyId: string, userEmail: string): Promise<{ url: string }> {
    const subscription = await this.prisma.subscription.findUniqueOrThrow({
      where: { companyId },
      include: { plan: true, company: true },
    });

    let stripeCustomerId = subscription.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await this.stripe.customers.create({
        email: userEmail,
        name: subscription.company.name,
        metadata: { companyId },
      });
      stripeCustomerId = customer.id;
      await this.prisma.subscription.update({
        where: { companyId },
        data: { stripeCustomerId },
      });
    }

    if (!subscription.plan.stripePriceId) {
      throw new Error(`Plan "${subscription.plan.code}" has no stripePriceId configured`);
    }

    const webOrigin = this.config.get<string>("WEB_ORIGIN") ?? "http://localhost:3000";
    const session = await this.stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: [{ price: subscription.plan.stripePriceId, quantity: subscription.seats }],
      success_url: `${webOrigin}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${webOrigin}/billing/canceled`,
      metadata: { companyId },
    });

    if (!session.url) throw new Error("Stripe did not return a checkout URL");
    return { url: session.url };
  }

  listPlans() {
    return this.prisma.plan.findMany({ orderBy: { pricePerSeat: "asc" } });
  }

  getSubscription(companyId: string) {
    return this.prisma.subscription.findUniqueOrThrow({ where: { companyId }, include: { plan: true } });
  }

  async changePlan(companyId: string, planCode: string) {
    const [subscription, newPlan] = await Promise.all([
      this.prisma.subscription.findUniqueOrThrow({ where: { companyId }, include: { plan: true } }),
      this.prisma.plan.findUniqueOrThrow({ where: { code: planCode } }),
    ]);

    if (subscription.stripeSubscriptionId && newPlan.stripePriceId) {
      const stripeSubscription = await this.stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
      const currentItem = stripeSubscription.items.data[0];
      await this.stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        items: [{ id: currentItem.id, price: newPlan.stripePriceId, quantity: subscription.seats }],
        proration_behavior: "create_prorations",
      });
    } else {
      this.logger.warn(
        `changePlan for company ${companyId}: no live Stripe subscription to update — applying locally only`,
      );
    }

    return this.prisma.subscription.update({
      where: { companyId },
      data: { planId: newPlan.id },
      include: { plan: true },
    });
  }

  async updateSeats(companyId: string, seats: number) {
    const subscription = await this.prisma.subscription.findUniqueOrThrow({ where: { companyId } });

    const memberCount = await this.prisma.membership.count({ where: { companyId } });
    if (seats < memberCount) {
      throw new BadRequestException(`Can't reduce seats below the current member count (${memberCount})`);
    }

    if (subscription.stripeSubscriptionId) {
      const stripeSubscription = await this.stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
      const currentItem = stripeSubscription.items.data[0];
      await this.stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        items: [{ id: currentItem.id, quantity: seats }],
        proration_behavior: "create_prorations",
      });
    } else {
      this.logger.warn(
        `updateSeats for company ${companyId}: no live Stripe subscription to update — applying locally only`,
      );
    }

    return this.prisma.subscription.update({ where: { companyId }, data: { seats } });
  }

  /** A bad signature is the sender's fault, so it's a 400 — left unmapped, Stripe's error surfaced
   * as a 500, which Stripe treats as "retry" and Sentry reports as a server fault for every forged
   * or misrouted request. */
  constructWebhookEvent(rawBody: Buffer, signature: string): Stripe.Event {
    const webhookSecret = this.config.getOrThrow<string>("STRIPE_WEBHOOK_SECRET");
    try {
      return this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err) {
      if (err instanceof Stripe.errors.StripeSignatureVerificationError) {
        throw new BadRequestException("Invalid Stripe signature");
      }
      throw err;
    }
  }

  async handleWebhookEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "payment" && session.metadata?.kind === "invoice_payment") {
          await this.recordInvoicePayment(session);
        } else if (session.mode === "setup" && session.metadata?.kind === "save_payment_method") {
          await this.clientPaymentMethods.handleSetupSessionCompleted(session);
        } else {
          await this.syncFromStripe(session);
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.created": {
        const subscriptionObj = event.data.object as Stripe.Subscription;
        await this.syncFromStripe(subscriptionObj);
        break;
      }
      case "customer.subscription.deleted": {
        const stripeSubscription = event.data.object as Stripe.Subscription;
        await this.prisma.subscription.updateMany({
          where: { stripeSubscriptionId: stripeSubscription.id },
          data: { status: "canceled" },
        });
        break;
      }
      // Only autopay's own off-session PaymentIntents carry kind: "autopay" (set in
      // ClientPaymentMethodsService.chargeOffSession) — a one-off online payment goes through
      // Checkout and is already recorded by checkout.session.completed above, so without this
      // guard a card autopay charge (which usually confirms synchronously) would be recorded
      // twice: once immediately by RecurringInvoicesService, once again here when Stripe fires
      // this same event for the PaymentIntent shortly after. recordPayment's dedup on the shared
      // PaymentIntent id makes that harmless either way, but the guard avoids the redundant work.
      case "payment_intent.succeeded":
      case "payment_intent.payment_failed": {
        const intent = event.data.object as Stripe.PaymentIntent;
        if (intent.metadata?.kind === "autopay") {
          await this.handleAutopayPaymentIntent(intent, event.type === "payment_intent.succeeded");
        }
        break;
      }
      default:
        this.logger.debug(`Unhandled Stripe event type: ${event.type}`);
    }
  }

  /** Resolves a SEPA/ACH autopay charge once it actually settles — see the "processing" branch of
   * RecurringInvoicesService.attemptAutopay for why this can't just be recorded synchronously. A
   * card autopay charge lands here too (Stripe fires this event for every PaymentIntent, not just
   * bank debits) but was already recorded synchronously with the same PaymentIntent id, so
   * recordPayment's dedup makes the second call here a harmless no-op. */
  private async handleAutopayPaymentIntent(intent: Stripe.PaymentIntent, succeeded: boolean): Promise<void> {
    const { companyId, invoiceId, method } = intent.metadata ?? {};
    if (!companyId || !invoiceId) {
      this.logger.warn(`Autopay ${intent.id} webhook missing companyId/invoiceId metadata, skipping`);
      return;
    }
    if (!succeeded) {
      this.logger.warn(
        `Autopay bank debit ${intent.id} failed for invoice ${invoiceId}: ${intent.last_payment_error?.message ?? "unknown reason"} — left as sent for normal reminders`,
      );
      return;
    }
    const amount = intent.amount / 100;
    await this.invoices.recordPayment(
      companyId,
      STRIPE_PAYMENT_ACTOR,
      invoiceId,
      { amount, method: method === "bank_transfer" ? "bank_transfer" : "card" },
      intent.id,
    );
  }

  private async recordInvoicePayment(session: Stripe.Checkout.Session): Promise<void> {
    const { companyId, invoiceId } = session.metadata ?? {};
    if (!companyId || !invoiceId) {
      this.logger.warn("Invoice payment webhook missing companyId/invoiceId metadata, skipping");
      return;
    }
    const amount = (session.amount_total ?? 0) / 100;
    if (amount <= 0) return;

    await this.invoices.recordPayment(companyId, STRIPE_PAYMENT_ACTOR, invoiceId, { amount, method: "card" }, session.id);
  }

  private async syncFromStripe(obj: Stripe.Subscription | Stripe.Checkout.Session): Promise<void> {
    const companyId = obj.metadata?.companyId;
    if (!companyId) {
      this.logger.warn("Stripe event missing companyId metadata, skipping sync");
      return;
    }

    let stripeSubscription: Stripe.Subscription;
    if ("items" in obj) {
      stripeSubscription = obj;
    } else {
      const subscriptionId = obj.subscription as string | null;
      if (!subscriptionId) return;
      stripeSubscription = await this.stripe.subscriptions.retrieve(subscriptionId);
    }

    const status = stripeSubscription.status === "active" || stripeSubscription.status === "trialing"
      ? "active"
      : stripeSubscription.status === "past_due"
        ? "past_due"
        : "canceled";

    await this.prisma.subscription.update({
      where: { companyId },
      data: {
        status,
        stripeSubscriptionId: stripeSubscription.id,
        currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
      },
    });
  }
}
