import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Stripe from "stripe";
import { PrismaService } from "../common/prisma/prisma.service";

/**
 * Saves a client's card via a Stripe Checkout session in "setup" mode (never charges anything
 * itself) so RecurringInvoice.autopayEnabled has a card to charge off-session later. Kept
 * separate from BillingService (which handles the company's own subscription billing) because
 * RecurringInvoicesService needs it and importing BillingModule from FinanceModule would be
 * circular — BillingModule already imports FinanceModule for InvoicesService.
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
    const client = await this.prisma.client.findFirstOrThrow({ where: { id: clientId, companyId } });

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
      payment_method_types: ["card"],
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
      data: { stripePaymentMethodId: null, stripePaymentMethodBrand: null, stripePaymentMethodLast4: null },
    });
    // A removed card can no longer fund autopay — turn it off wherever it was relying on this client's card.
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
        stripePaymentMethodBrand: paymentMethod.card?.brand ?? null,
        stripePaymentMethodLast4: paymentMethod.card?.last4 ?? null,
      },
    });
  }

  /** Never throws — a decline is a normal outcome the caller should log and fall back to the
   * ordinary reminder flow for, not a failure that should break a due-pass loop over many clients. */
  async chargeOffSession(
    companyId: string,
    clientId: string,
    amount: number,
    currency: string,
  ): Promise<{ succeeded: boolean; error?: string }> {
    const client = await this.prisma.client.findFirstOrThrow({ where: { id: clientId, companyId } });
    if (!client.stripeCustomerId || !client.stripePaymentMethodId) {
      return { succeeded: false, error: "No saved payment method" };
    }

    try {
      await this.stripe.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency: currency.toLowerCase(),
        customer: client.stripeCustomerId,
        payment_method: client.stripePaymentMethodId,
        off_session: true,
        confirm: true,
      });
      return { succeeded: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Autopay charge failed for client ${clientId}: ${message}`);
      return { succeeded: false, error: message };
    }
  }
}
