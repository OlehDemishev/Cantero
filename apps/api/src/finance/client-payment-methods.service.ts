import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Stripe from "stripe";
import { PrismaService } from "../common/prisma/prisma.service";

/** Which Checkout payment method types to offer, based on the company's own currency — SEPA
 * Direct Debit only ever settles in EUR and US bank account (ACH) only in USD, so offering either
 * for a mismatched company currency would save a payment method that can never actually charge
 * successfully. Card has no such restriction and is always offered. */
function paymentMethodTypesFor(currency: string): Stripe.Checkout.SessionCreateParams.PaymentMethodType[] {
  if (currency === "EUR") return ["card", "sepa_debit"];
  if (currency === "USD") return ["card", "us_bank_account"];
  return ["card"];
}

/**
 * Saves a client's payment method (card, and — depending on the company's currency — SEPA Direct
 * Debit or US bank account/ACH) via a Stripe Checkout session in "setup" mode (never charges
 * anything itself) so RecurringInvoice.autopayEnabled has something to charge off-session later.
 * Kept separate from BillingService (which handles the company's own subscription billing)
 * because RecurringInvoicesService needs it and importing BillingModule from FinanceModule would
 * be circular — BillingModule already imports FinanceModule for InvoicesService.
 */
@Injectable()
export class ClientPaymentMethodsService {
  private readonly logger = new Logger(ClientPaymentMethodsService.name);
  private readonly stripe: Stripe;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.stripe = new Stripe(this.config.getOrThrow<string>("STRIPE_SECRET_KEY"));
  }

  async createSetupSession(companyId: string, clientId: string): Promise<{ url: string }> {
    const client = await this.prisma.client.findFirstOrThrow({
      where: { id: clientId, companyId },
      include: { company: { select: { currency: true } } },
    });

    let stripeCustomerId = client.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await this.stripe.customers.create({
        email: client.email ?? undefined,
        name: client.name,
        metadata: { companyId, clientId },
      });
      stripeCustomerId = customer.id;
      await this.prisma.client.update({ where: { id: clientId }, data: { stripeCustomerId } });
    }

    const webOrigin = this.config.get<string>("PORTAL_ORIGIN") ?? this.config.get<string>("WEB_ORIGIN") ?? "http://localhost:3000";
    const session = await this.stripe.checkout.sessions.create({
      mode: "setup",
      customer: stripeCustomerId,
      payment_method_types: paymentMethodTypesFor(client.company.currency),
      // Required by Stripe whenever payment_method_types includes a currency-specific method
      // (sepa_debit/us_bank_account); harmless to pass for the card-only case too.
      currency: client.company.currency.toLowerCase(),
      success_url: `${webOrigin}/portal?cardSaved=1`,
      cancel_url: `${webOrigin}/portal`,
      metadata: { companyId, clientId, kind: "save_payment_method" },
    });
    if (!session.url) throw new Error("Stripe did not return a checkout URL");
    return { url: session.url };
  }

  async removePaymentMethod(companyId: string, clientId: string): Promise<void> {
    const client = await this.prisma.client.findFirstOrThrow({ where: { id: clientId, companyId } });
    if (client.stripePaymentMethodId) {
      try {
        await this.stripe.paymentMethods.detach(client.stripePaymentMethodId);
      } catch (err) {
        this.logger.warn(`Failed to detach payment method for client ${clientId}: ${(err as Error).message}`);
      }
    }
    await this.prisma.client.update({
      where: { id: clientId },
      data: { stripePaymentMethodId: null, stripePaymentMethodType: null, stripePaymentMethodBrand: null, stripePaymentMethodLast4: null },
    });
    // A removed payment method can no longer fund autopay — turn it off wherever it relied on it.
    await this.prisma.recurringInvoice.updateMany({
      where: { companyId, clientId, autopayEnabled: true },
      data: { autopayEnabled: false },
    });
  }

  /** Routed here from BillingService's Stripe webhook dispatch when a "setup" mode Checkout session completes. */
  async handleSetupSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const clientId = session.metadata?.clientId;
    if (!clientId || !session.setup_intent) return;

    const setupIntent = await this.stripe.setupIntents.retrieve(session.setup_intent as string);
    const paymentMethodId = setupIntent.payment_method as string | null;
    if (!paymentMethodId) return;

    const paymentMethod = await this.stripe.paymentMethods.retrieve(paymentMethodId);
    await this.prisma.client.update({
      where: { id: clientId },
      data: {
        stripePaymentMethodId: paymentMethodId,
        stripePaymentMethodType: paymentMethod.type,
        stripePaymentMethodBrand: paymentMethod.card?.brand ?? null,
        stripePaymentMethodLast4: paymentMethod.card?.last4 ?? paymentMethod.sepa_debit?.last4 ?? paymentMethod.us_bank_account?.last4 ?? null,
      },
    });
  }

  /** Never throws — a decline is a normal outcome the caller should log and fall back to the
   * ordinary reminder flow for, not a failure that should break a due-pass loop over many clients.
   *
   * Unlike a card, SEPA Direct Debit and US bank account (ACH) charges don't settle synchronously:
   * Stripe confirms the PaymentIntent immediately but its status comes back "processing" and takes
   * several business days to resolve to "succeeded" or fail. Recording the invoice as paid the
   * moment "processing" comes back would credit money that hasn't actually arrived yet — so the
   * caller must only record a payment on "succeeded", and leave "processing" alone until
   * BillingService's payment_intent.succeeded/payment_intent.payment_failed webhook (using the
   * invoiceId in this PaymentIntent's own metadata) resolves it later. */
  async chargeOffSession(
    companyId: string,
    clientId: string,
    invoiceId: string,
    amount: number,
    currency: string,
  ): Promise<{ status: "succeeded" | "processing" | "failed"; error?: string; paymentIntentId?: string; method?: "card" | "bank_transfer" }> {
    const client = await this.prisma.client.findFirstOrThrow({ where: { id: clientId, companyId } });
    if (!client.stripeCustomerId || !client.stripePaymentMethodId) {
      return { status: "failed", error: "No saved payment method" };
    }
    const method: "card" | "bank_transfer" = client.stripePaymentMethodType === "card" || !client.stripePaymentMethodType ? "card" : "bank_transfer";

    try {
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency: currency.toLowerCase(),
        customer: client.stripeCustomerId,
        payment_method: client.stripePaymentMethodId,
        off_session: true,
        confirm: true,
        metadata: { companyId, clientId, invoiceId, method, kind: "autopay" },
      });
      if (paymentIntent.status === "succeeded") return { status: "succeeded", paymentIntentId: paymentIntent.id, method };
      if (paymentIntent.status === "processing") return { status: "processing", paymentIntentId: paymentIntent.id, method };
      return { status: "failed", error: `Unexpected PaymentIntent status: ${paymentIntent.status}` };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Autopay charge failed for client ${clientId}: ${message}`);
      return { status: "failed", error: message };
    }
  }
}
