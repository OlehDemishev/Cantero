import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Stripe from "stripe";
import { PrismaService } from "../common/prisma/prisma.service";
import { StripeConnectService } from "./stripe-connect.service";

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
 *
 * Everything here lives on the company's own connected Stripe account (see StripeConnectService):
 * the Customer, the saved payment method and every autopay charge. Client.stripeAccountId records
 * which account the saved method is on; one saved before Stripe Connect (null — the platform
 * account) or on an account the company has since replaced can't be charged, and reads as nothing
 * on file until the client saves one again.
 */
@Injectable()
export class ClientPaymentMethodsService {
  private readonly logger = new Logger(ClientPaymentMethodsService.name);
  private readonly stripe: Stripe;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly connect: StripeConnectService,
  ) {
    this.stripe = new Stripe(this.config.getOrThrow<string>("STRIPE_SECRET_KEY"));
  }

  async createSetupSession(companyId: string, clientId: string): Promise<{ url: string }> {
    const stripeAccount = await this.connect.chargeableAccountFor(companyId);
    const client = await this.prisma.client.findFirstOrThrow({
      where: { id: clientId, companyId },
      include: { company: { select: { currency: true } } },
    });

    // A Customer from before Stripe Connect (or from an account the company has since replaced)
    // lives on another account and can't be used here — start a fresh one on the company's own.
    let stripeCustomerId = client.stripeAccountId === stripeAccount ? client.stripeCustomerId : null;
    if (!stripeCustomerId) {
      const customer = await this.stripe.customers.create(
        { email: client.email ?? undefined, name: client.name, metadata: { companyId, clientId } },
        { stripeAccount },
      );
      stripeCustomerId = customer.id;
      await this.prisma.client.update({
        where: { id: clientId },
        data: {
          stripeCustomerId,
          stripeAccountId: stripeAccount,
          stripePaymentMethodId: null,
          stripePaymentMethodType: null,
          stripePaymentMethodBrand: null,
          stripePaymentMethodLast4: null,
        },
      });
    }

    const webOrigin = this.config.get<string>("PORTAL_ORIGIN") ?? this.config.get<string>("WEB_ORIGIN") ?? "http://localhost:3000";
    const session = await this.stripe.checkout.sessions.create(
      {
        mode: "setup",
        customer: stripeCustomerId,
        payment_method_types: paymentMethodTypesFor(client.company.currency),
        // Required by Stripe whenever payment_method_types includes a currency-specific method
        // (sepa_debit/us_bank_account); harmless to pass for the card-only case too.
        currency: client.company.currency.toLowerCase(),
        success_url: `${webOrigin}/portal?cardSaved=1`,
        cancel_url: `${webOrigin}/portal`,
        metadata: { companyId, clientId, kind: "save_payment_method" },
      },
      { stripeAccount },
    );
    if (!session.url) throw new Error("Stripe did not return a checkout URL");
    return { url: session.url };
  }

  async removePaymentMethod(companyId: string, clientId: string): Promise<void> {
    const client = await this.prisma.client.findFirstOrThrow({ where: { id: clientId, companyId } });
    if (client.stripePaymentMethodId) {
      try {
        // Null stripeAccountId: saved on the platform account before Stripe Connect.
        await this.stripe.paymentMethods.detach(client.stripePaymentMethodId, {}, client.stripeAccountId ? { stripeAccount: client.stripeAccountId } : undefined);
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

  /** Routed here from BillingService's Stripe webhook dispatch when a "setup" mode Checkout session
   * completes. `stripeAccount` is the account the event came from, already checked by the caller
   * to be `companyId`'s own — null only for a session opened on the platform account before
   * Stripe Connect, whose method is recorded but can't be charged (see the class comment). The
   * client is matched within `companyId` too, so metadata can never point at another company's
   * client. */
  async handleSetupSessionCompleted(session: Stripe.Checkout.Session, companyId: string, stripeAccount: string | null): Promise<void> {
    const clientId = session.metadata?.clientId;
    if (!clientId || !session.setup_intent) return;

    const options = stripeAccount ? { stripeAccount } : undefined;
    const setupIntent = await this.stripe.setupIntents.retrieve(session.setup_intent as string, {}, options);
    const paymentMethodId = setupIntent.payment_method as string | null;
    if (!paymentMethodId) return;

    const paymentMethod = await this.stripe.paymentMethods.retrieve(paymentMethodId, {}, options);
    await this.prisma.client.updateMany({
      where: { id: clientId, companyId },
      data: {
        stripeAccountId: stripeAccount,
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
    const [client, company] = await Promise.all([
      this.prisma.client.findFirstOrThrow({ where: { id: clientId, companyId } }),
      this.prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { stripeAccountId: true, stripeChargesEnabled: true } }),
    ]);
    const stripeAccount = company.stripeAccountId;
    if (!stripeAccount || !company.stripeChargesEnabled) {
      return { status: "failed", error: "Online payment isn't set up for this company" };
    }
    if (!hasUsablePaymentMethod(client, stripeAccount)) {
      return { status: "failed", error: "No saved payment method on the company's Stripe account" };
    }
    const method: "card" | "bank_transfer" = client.stripePaymentMethodType === "card" || !client.stripePaymentMethodType ? "card" : "bank_transfer";

    try {
      const paymentIntent = await this.stripe.paymentIntents.create(
        {
          amount: Math.round(amount * 100),
          currency: currency.toLowerCase(),
          customer: client.stripeCustomerId!,
          payment_method: client.stripePaymentMethodId!,
          off_session: true,
          confirm: true,
          metadata: { companyId, clientId, invoiceId, method, kind: "autopay" },
        },
        // One autopay charge per invoice: a retried generation pass gets the same PaymentIntent back
        // from Stripe instead of charging the client a second time.
        { stripeAccount, idempotencyKey: `autopay-${invoiceId}` },
      );
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

/** Whether the client's saved method lives on `stripeAccount` and so can actually be charged
 * there — see ClientPaymentMethodsService's class comment. */
export function hasUsablePaymentMethod(
  client: { stripeAccountId: string | null; stripeCustomerId: string | null; stripePaymentMethodId: string | null },
  stripeAccount: string | null,
): boolean {
  return !!stripeAccount && client.stripeAccountId === stripeAccount && !!client.stripeCustomerId && !!client.stripePaymentMethodId;
}
