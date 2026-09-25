import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Stripe from "stripe";
import { PrismaService } from "../common/prisma/prisma.service";
import { InvoicesService } from "../finance/invoices.service";
import { ClientPaymentMethodsService } from "../finance/client-payment-methods.service";
import { StripeConnectService } from "../finance/stripe-connect.service";

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
    private readonly connect: StripeConnectService,
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
   * pay a single invoice online, created on the company's own connected Stripe account (see
   * StripeConnectService) so the money lands there. Recorded as a Payment once the webhook
   * confirms the money actually arrived — see recordInvoicePayment for delayed methods. */
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
    const stripeAccount = await this.connect.chargeableAccountFor(companyId);
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
    const session = await this.stripe.checkout.sessions.create(
      {
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
      },
      { stripeAccount },
    );

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
  /** "platform" is the endpoint for the platform account's own events (Cantero subscriptions);
   * "connect" is the Connect endpoint for events on companies' connected accounts — Stripe signs
   * each endpoint with its own secret. */
  constructWebhookEvent(rawBody: Buffer, signature: string, source: "platform" | "connect" = "platform"): Stripe.Event {
    const webhookSecret = this.config.getOrThrow<string>(source === "connect" ? "STRIPE_CONNECT_WEBHOOK_SECRET" : "STRIPE_WEBHOOK_SECRET");
    try {
      return this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err) {
      if (err instanceof Stripe.errors.StripeSignatureVerificationError) {
        throw new BadRequestException("Invalid Stripe signature");
      }
      throw err;
    }
  }

  /** Events on the platform account itself: the company's own Cantero subscription. Invoice
   * payments here are only ever Checkout sessions/PaymentIntents opened on the platform account
   * before Stripe Connect that settle afterwards — created by this code with the platform key, so
   * their metadata can be trusted. */
  async handleWebhookEvent(event: Stripe.Event): Promise<void> {
    if (event.account) {
      // A connected account's event delivered to the platform endpoint — misconfigured endpoint.
      // Its metadata is set by whoever owns that account, so it must never reach the handlers below.
      this.logger.warn(`Stripe event ${event.id} for connected account ${event.account} arrived on the platform endpoint, ignoring`);
      return;
    }
    if (await this.handleClientPaymentEvent(event, null)) return;

    switch (event.type) {
      case "checkout.session.completed": {
        await this.syncFromStripe(event.data.object as Stripe.Checkout.Session);
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
      default:
        this.logger.debug(`Unhandled Stripe event type: ${event.type}`);
    }
  }

  /** Events on companies' connected accounts (Stripe Connect endpoint): their clients' invoice
   * payments, saved payment methods and autopay, plus the account's own onboarding state.
   * Subscription events are never handled here — a connected account's owner can create
   * subscriptions with any metadata on their own account, and must not be able to touch a
   * Cantero subscription that way. */
  async handleConnectWebhookEvent(event: Stripe.Event): Promise<void> {
    const account = event.account;
    if (!account) {
      this.logger.warn(`Stripe event ${event.id} without an account arrived on the Connect endpoint, ignoring`);
      return;
    }
    switch (event.type) {
      case "account.updated":
        await this.connect.handleAccountUpdated(event.data.object as Stripe.Account);
        return;
      case "account.application.deauthorized":
        await this.connect.handleDeauthorized(account);
        return;
    }
    if (!(await this.handleClientPaymentEvent(event, account))) {
      this.logger.debug(`Unhandled Stripe Connect event type: ${event.type}`);
    }
  }

  /** The invoice-payment, saved-payment-method and autopay events common to both endpoints.
   * `account` is the connected account the event came from (null: the platform account). A
   * connected account's event is acted on only when that account is the one belonging to the
   * company named in its metadata — otherwise one company could create a Checkout session on its
   * own Stripe account naming another company's invoice, and mark it paid. Returns whether the
   * event was one of these kinds. */
  private async handleClientPaymentEvent(event: Stripe.Event, account: string | null): Promise<boolean> {
    switch (event.type) {
      case "checkout.session.completed":
      // Delayed methods (SEPA Direct Debit, Sofort, bank transfer, ...) complete the session while
      // the money is still on its way; it lands (or doesn't) days later with one of these two.
      case "checkout.session.async_payment_succeeded":
      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const kind = session.metadata?.kind;
        if (kind !== "invoice_payment" && kind !== "save_payment_method") return false;
        if (!(await this.trustedCompany(session.metadata, account, event.id))) return true;
        if (kind === "save_payment_method") {
          if (session.mode === "setup" && event.type === "checkout.session.completed") {
            await this.clientPaymentMethods.handleSetupSessionCompleted(session, session.metadata!.companyId, account);
          }
        } else if (session.mode === "payment") {
          if (event.type === "checkout.session.async_payment_failed") {
            this.logger.warn(`Delayed payment for invoice ${session.metadata?.invoiceId} (session ${session.id}) failed — left open`);
          } else {
            await this.recordInvoicePayment(session);
          }
        }
        return true;
      }
      // Only autopay's own off-session PaymentIntents carry kind: "autopay" (set in
      // ClientPaymentMethodsService.chargeOffSession) — a one-off online payment goes through
      // Checkout and is already recorded by the Checkout events above, so without this
      // guard a card autopay charge (which usually confirms synchronously) would be recorded
      // twice: once immediately by RecurringInvoicesService, once again here when Stripe fires
      // this same event for the PaymentIntent shortly after. recordPayment's dedup on the shared
      // PaymentIntent id makes that harmless either way, but the guard avoids the redundant work.
      case "payment_intent.succeeded":
      case "payment_intent.payment_failed": {
        const intent = event.data.object as Stripe.PaymentIntent;
        if (intent.metadata?.kind !== "autopay") return false;
        if (!(await this.trustedCompany(intent.metadata, account, event.id))) return true;
        await this.handleAutopayPaymentIntent(intent, event.type === "payment_intent.succeeded");
        return true;
      }
      default:
        return false;
    }
  }

  private async trustedCompany(metadata: Stripe.Metadata | null | undefined, account: string | null, eventId: string): Promise<boolean> {
    const companyId = metadata?.companyId;
    if (!companyId) {
      this.logger.warn(`Stripe event ${eventId} missing companyId metadata, skipping`);
      return false;
    }
    if (account && !(await this.connect.accountBelongsTo(account, companyId))) {
      this.logger.warn(`Stripe event ${eventId} from account ${account} names company ${companyId}, which isn't that account's — ignoring`);
      return false;
    }
    return true;
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

  /** Only once the money has actually arrived: a card completes the session with payment_status
   * "paid", but a delayed method completes it "unpaid" and settles later through
   * checkout.session.async_payment_succeeded (which carries the same session, now "paid").
   * Recording on the first "completed" would mark the invoice paid days before — or even if
   * never — the debit clears. */
  private async recordInvoicePayment(session: Stripe.Checkout.Session): Promise<void> {
    const { companyId, invoiceId } = session.metadata ?? {};
    if (!companyId || !invoiceId) {
      this.logger.warn("Invoice payment webhook missing companyId/invoiceId metadata, skipping");
      return;
    }
    if (session.payment_status !== "paid") {
      this.logger.log(`Checkout ${session.id} for invoice ${invoiceId} completed with payment ${session.payment_status} — waiting for it to settle`);
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
