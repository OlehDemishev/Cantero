import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { AccountingConnection, AccountingProvider as AccountingProviderEnum } from "@prisma/client";
import type { AccountingProviderType } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { apiOrigin, exchangeCode, refreshIfExpiring, requestToken, signState, tokenExpiry, verifyState, type TokenEndpoint } from "../common/oauth/oauth";
import { encryptSecret, withDecryptedTokens, withEncryptedTokens } from "../common/crypto/secret-box";

const FETCH_TIMEOUT_MS = 10_000;
/// Intuit, unlike Xero, splits sandbox and production data onto different API hosts (the OAuth
/// endpoints above are shared by both). Defaulting to sandbox keeps local dev/test working with
/// no env var set, but a real deployment MUST set QUICKBOOKS_API_BASE_URL to
/// "https://quickbooks.api.intuit.com" or every sync silently keeps writing into a sandbox
/// company no real QBO user ever sees.
const QUICKBOOKS_SANDBOX_API_BASE_URL = "https://sandbox-quickbooks.api.intuit.com";

type OAuthProviderType = Exclude<AccountingProviderType, "lexoffice">;

interface ProviderConfig {
  name: string;
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  clientIdKey: string;
  clientSecretKey: string;
}

/// OAuth2 config for QuickBooks/Xero only — lexoffice has no third-party OAuth app model at all,
/// just a per-account Public API Key the company generates themselves and pastes in (see
/// connectLexoffice()), so it has nothing to put here.
const PROVIDERS: Record<OAuthProviderType, ProviderConfig> = {
  quickbooks: {
    name: "QuickBooks",
    authorizeUrl: "https://appcenter.intuit.com/connect/oauth2",
    tokenUrl: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
    scope: "com.intuit.quickbooks.accounting",
    clientIdKey: "QUICKBOOKS_CLIENT_ID",
    clientSecretKey: "QUICKBOOKS_CLIENT_SECRET",
  },
  xero: {
    name: "Xero",
    authorizeUrl: "https://login.xero.com/identity/connect/authorize",
    tokenUrl: "https://identity.xero.com/connect/token",
    scope: "accounting.transactions accounting.contacts offline_access",
    clientIdKey: "XERO_CLIENT_ID",
    clientSecretKey: "XERO_CLIENT_SECRET",
  },
};

/// lexoffice rebranded to Lexware Office and moved its API gateway here on 2025-05-26; the old
/// api.lexoffice.io host was only kept "until December 2025" (developers.lexware.io, Introduction).
const LEXOFFICE_API_BASE_URL = "https://api.lexware.io/v1";
/// lexoffice's Public API Key doesn't expire and isn't refreshed via OAuth — this sentinel just
/// keeps AccountingConnection.tokenExpiresAt (a non-nullable column shared with QuickBooks/Xero's
/// real expiry) self-explanatory to anyone reading the row directly. ensureFreshToken() never
/// evaluates this for a lexoffice connection; it short-circuits before the expiry check runs.
const LEXOFFICE_NO_EXPIRY = new Date("9999-12-31T00:00:00.000Z");

export interface SyncSummary {
  synced: number;
  failed: number;
  errors: string[];
}

/**
 * Live sync with QuickBooks Online / Xero / lexoffice: push unsynced invoices (creating the
 * customer first if needed), track the external ID for idempotency. QuickBooks/Xero connect via
 * OAuth2 authorization-code flow and each needs its own app registered with Intuit/Xero
 * (CLIENT_ID/SECRET env vars) — with neither configured, getAuthorizeUrl fails fast with a clear
 * error instead of building a redirect that would 404 at the provider. lexoffice has no
 * third-party OAuth app model at all: a company generates their own Public API Key in lexoffice's
 * own Settings and pastes it in via connectLexoffice() — there's no CLIENT_ID/SECRET to configure
 * on this server for it, and no authorize/callback redirect.
 *
 * lexoffice support here is built from its public API docs, not verified against a real account —
 * the same "hand-built, honest subset" spirit as e-invoice.ts/gaeb.ts/zugferd.ts/datev.ts, but
 * with the lowest confidence of any of them, since I can't test a live sync. AR-side sync
 * (syncInvoices → contacts + invoices) is implemented; AP-side (syncBills) deliberately isn't —
 * lexoffice's Vouchers API models incoming receipts/documents for bookkeeping, not a
 * create-a-payable-with-line-items concept comparable to a QuickBooks Bill or Xero ACCPAY invoice,
 * and guessing that shape without a real account to verify against risked corrupting someone's
 * books. **Do one supervised test sync against a real lexoffice account before relying on this.**
 */
@Injectable()
export class AccountingSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  async getStatus(companyId: string) {
    const connection = await this.prisma.accountingConnection.findUnique({ where: { companyId } });
    if (!connection) return { connected: false as const };
    return {
      connected: true as const,
      provider: connection.provider,
      externalAccountId: connection.externalAccountId,
      connectedAt: connection.connectedAt,
    };
  }

  /** lexoffice's equivalent of getAuthorizeUrl()/handleCallback() combined into one step, since
   * there's no redirect dance: validates the pasted key by calling GET /v1/profile (which also
   * doubles as the "does this key actually work" check) and stores it as the connection right
   * away. */
  async connectLexoffice(companyId: string, apiKey: string): Promise<{ ok: true }> {
    const res = await fetch(`${LEXOFFICE_API_BASE_URL}/profile`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new BadRequestException(
        res.status === 401 ? "That lexoffice API key was rejected — check it and try again" : `lexoffice rejected the connection (${res.status})`,
      );
    }
    const profile = (await res.json()) as { organizationId: string };

    await this.prisma.accountingConnection.upsert({
      where: { companyId },
      create: {
        companyId,
        provider: "lexoffice",
        accessToken: encryptSecret(apiKey),
        refreshToken: "",
        tokenExpiresAt: LEXOFFICE_NO_EXPIRY,
        externalAccountId: profile.organizationId,
      },
      update: {
        provider: "lexoffice",
        accessToken: encryptSecret(apiKey),
        refreshToken: "",
        tokenExpiresAt: LEXOFFICE_NO_EXPIRY,
        externalAccountId: profile.organizationId,
      },
    });
    return { ok: true };
  }

  getAuthorizeUrl(companyId: string, provider: AccountingProviderType): string {
    if (provider === "lexoffice") {
      throw new BadRequestException("lexoffice connects with a Public API Key, not OAuth — use the lexoffice connect form instead");
    }
    const cfg = PROVIDERS[provider];
    const clientId = this.config.get<string>(cfg.clientIdKey);
    if (!clientId) {
      throw new BadRequestException(
        `${cfg.name} isn't configured on this server — set ${cfg.clientIdKey}/${cfg.clientSecretKey}`,
      );
    }

    const state = signState(this.jwt, { companyId, provider });
    const redirectUri = this.callbackUrl(provider);
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: cfg.scope,
      state,
    });
    if (provider === "quickbooks") params.set("access_type", "offline");

    return `${cfg.authorizeUrl}?${params.toString()}`;
  }

  /** Verifies the signed state, exchanges the code for tokens, and stores the connection. Returns the companyId so the controller can redirect appropriately even on later failures. */
  async handleCallback(
    provider: AccountingProviderType,
    code: string,
    state: string,
    realmId: string | undefined,
  ): Promise<{ companyId: string }> {
    // lexoffice never reaches here in normal use — getAuthorizeUrl() refuses to build a signed
    // state for it, so a request would need a forged/stale state to arrive at all. Guarded
    // anyway for the same fail-fast reason as getAuthorizeUrl, and so `provider` narrows to
    // OAuthProviderType below.
    if (provider === "lexoffice") throw new BadRequestException("lexoffice doesn't use this callback");

    const decoded = verifyState<{ companyId: string; provider: AccountingProviderType }>(this.jwt, state);
    if (decoded.provider !== provider) throw new BadRequestException("Provider mismatch");

    const tokens = await exchangeCode(this.tokenEndpoint(provider), { code, redirect_uri: this.callbackUrl(provider) });
    const externalAccountId = provider === "quickbooks" ? realmId : await this.fetchXeroTenantId(tokens.access_token);
    if (!externalAccountId) throw new BadRequestException("The provider didn't return an account identifier");

    await this.prisma.accountingConnection.upsert({
      where: { companyId: decoded.companyId },
      create: {
        companyId: decoded.companyId,
        provider: provider as AccountingProviderEnum,
        accessToken: encryptSecret(tokens.access_token),
        refreshToken: encryptSecret(tokens.refresh_token),
        tokenExpiresAt: tokenExpiry(tokens),
        externalAccountId,
      },
      update: {
        provider: provider as AccountingProviderEnum,
        accessToken: encryptSecret(tokens.access_token),
        refreshToken: encryptSecret(tokens.refresh_token),
        tokenExpiresAt: tokenExpiry(tokens),
        externalAccountId,
      },
    });

    return { companyId: decoded.companyId };
  }

  async disconnect(companyId: string) {
    await this.prisma.accountingConnection.deleteMany({ where: { companyId } });
    return { ok: true };
  }

  /** Pushes every not-yet-synced, non-draft invoice. One invoice's failure doesn't block the rest — its message is collected instead. */
  async syncInvoices(companyId: string): Promise<SyncSummary> {
    const connection = await this.getConnectionOrThrow(companyId);
    const fresh = await this.ensureFreshToken(connection);

    const invoices = await this.prisma.invoice.findMany({
      where: { companyId, externalAccountingId: null, status: { not: "draft" } },
      include: { client: true },
    });

    const summary: SyncSummary = { synced: 0, failed: 0, errors: [] };
    for (const invoice of invoices) {
      try {
        const externalCustomerId = await this.ensureCustomer(fresh, invoice.client);
        const externalInvoiceId = await this.pushInvoice(fresh, invoice, externalCustomerId);
        await this.prisma.invoice.update({
          where: { id: invoice.id },
          data: { externalAccountingId: externalInvoiceId, externalAccountingSyncedAt: new Date() },
        });
        summary.synced++;
        await this.logAttempt(companyId, connection.provider, invoice, "success");
      } catch (err) {
        const message = (err as Error).message ?? "sync failed";
        summary.failed++;
        summary.errors.push(`${invoice.number}: ${message}`);
        await this.logAttempt(companyId, connection.provider, invoice, "failed", message);
      }
    }
    return summary;
  }

  private logAttempt(
    companyId: string,
    provider: AccountingProviderEnum,
    invoice: { id: string; number: string },
    status: "success" | "failed",
    errorMessage?: string,
  ) {
    return this.prisma.accountingSyncLog.create({
      data: { companyId, provider, invoiceId: invoice.id, invoiceNumber: invoice.number, status, errorMessage },
    });
  }

  /** AP-side counterpart to syncInvoices() — pushes every not-yet-synced SubcontractorCost as a
   * Bill (QuickBooks) / ACCPAY invoice (Xero), creating the vendor/supplier contact first if
   * needed. Same one-failure-doesn't-block-the-rest shape. */
  async syncBills(companyId: string): Promise<SyncSummary> {
    const connection = await this.getConnectionOrThrow(companyId);
    if (connection.provider === "lexoffice") {
      throw new BadRequestException(
        "Syncing bills to lexoffice isn't supported yet — lexoffice's API models incoming documents differently from a QuickBooks Bill or Xero ACCPAY invoice",
      );
    }
    const fresh = await this.ensureFreshToken(connection);

    const bills = await this.prisma.subcontractorCost.findMany({
      where: { companyId, externalAccountingId: null },
      include: { subcontractor: true, project: { select: { currency: true } } },
    });
    // A subcontractor cost has no currency of its own — it's in its project's currency, falling
    // back to the company's, the same rule invoices use.
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { currency: true } });

    const summary: SyncSummary = { synced: 0, failed: 0, errors: [] };
    for (const bill of bills) {
      const reference = `${bill.subcontractor.name} — ${bill.description}`;
      try {
        const externalVendorId = await this.ensureVendor(fresh, bill.subcontractor);
        const externalBillId = await this.pushBill(fresh, { ...bill, currency: bill.project?.currency ?? company.currency }, externalVendorId);
        await this.prisma.subcontractorCost.update({
          where: { id: bill.id },
          data: { externalAccountingId: externalBillId, externalAccountingSyncedAt: new Date() },
        });
        summary.synced++;
        await this.logBillAttempt(companyId, connection.provider, bill.id, reference, "success");
      } catch (err) {
        const message = (err as Error).message ?? "sync failed";
        summary.failed++;
        summary.errors.push(`${reference}: ${message}`);
        await this.logBillAttempt(companyId, connection.provider, bill.id, reference, "failed", message);
      }
    }
    return summary;
  }

  private logBillAttempt(
    companyId: string,
    provider: AccountingProviderEnum,
    subcontractorCostId: string,
    reference: string,
    status: "success" | "failed",
    errorMessage?: string,
  ) {
    return this.prisma.accountingSyncLog.create({
      data: { companyId, provider, subcontractorCostId, subcontractorCostReference: reference, status, errorMessage },
    });
  }

  /** Recent sync attempts (success and failure), newest first — the persistent trail the
   * transient SyncSummary toast can't provide once the page reloads. */
  syncHistory(companyId: string, limit = 50) {
    return this.prisma.accountingSyncLog.findMany({ where: { companyId }, orderBy: { attemptedAt: "desc" }, take: limit });
  }

  /** Invoices that should be synced but aren't (not-draft, no externalAccountingId yet) plus the
   * most recent sync failures — surfaces drift between this app and the connected provider
   * without requiring the user to comb through every invoice by hand. Skips the unsynced-bills
   * query for lexoffice (syncBills isn't supported there — see its own comment) so the panel
   * doesn't show a "N bills not yet synced" count next to a sync action that doesn't exist. */
  async integrityCheck(companyId: string) {
    const connection = await this.prisma.accountingConnection.findUnique({ where: { companyId } });
    const [unsyncedInvoices, unsyncedBills, recentFailures] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { companyId, externalAccountingId: null, status: { not: "draft" } },
        select: { id: true, number: true, total: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
      connection?.provider === "lexoffice"
        ? Promise.resolve([])
        : this.prisma.subcontractorCost.findMany({
            where: { companyId, externalAccountingId: null },
            select: { id: true, description: true, amount: true, incurredDate: true, subcontractor: { select: { name: true } } },
            orderBy: { incurredDate: "desc" },
          }),
      this.prisma.accountingSyncLog.findMany({
        where: { companyId, status: "failed" },
        orderBy: { attemptedAt: "desc" },
        take: 20,
      }),
    ]);
    return { connected: !!connection, provider: connection?.provider ?? null, unsyncedInvoices, unsyncedBills, recentFailures };
  }

  private async getConnectionOrThrow(companyId: string) {
    const connection = await this.prisma.accountingConnection.findUnique({ where: { companyId } });
    if (!connection) throw new NotFoundException("No accounting system connected");
    return withDecryptedTokens(connection);
  }

  /** Refreshes and persists the access token when it's expired (or about to), so callers always get a usable one. */
  private ensureFreshToken(connection: AccountingConnection): Promise<AccountingConnection> {
    if (connection.provider === "lexoffice") return Promise.resolve(connection);
    const provider = connection.provider as OAuthProviderType;
    return refreshIfExpiring(connection, {
      kind: "accounting",
      reconnectMessage: "Failed to refresh the accounting connection — reconnect it in Settings",
      reload: async () => withDecryptedTokens(await this.prisma.accountingConnection.findUnique({ where: { id: connection.id } })),
      refresh: async (c) => {
        const tokens = await requestToken(this.tokenEndpoint(provider), { grant_type: "refresh_token", refresh_token: c.refreshToken });
        const updated = await this.prisma.accountingConnection.update({
          where: { id: c.id },
          data: withEncryptedTokens({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token ?? c.refreshToken, tokenExpiresAt: tokenExpiry(tokens) }),
        });
        return withDecryptedTokens(updated);
      },
    });
  }

  private tokenEndpoint(provider: OAuthProviderType): TokenEndpoint {
    const cfg = PROVIDERS[provider];
    return {
      provider: cfg.name,
      url: cfg.tokenUrl,
      clientId: this.config.getOrThrow<string>(cfg.clientIdKey),
      clientSecret: this.config.getOrThrow<string>(cfg.clientSecretKey),
      clientAuth: "basic",
    };
  }

  /** Xero's token response has no tenant/company identifier — it's fetched separately, right after connecting. */
  private async fetchXeroTenantId(accessToken: string): Promise<string | undefined> {
    const res = await fetch("https://api.xero.com/connections", {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return undefined;
    const connections = (await res.json()) as { tenantId: string }[];
    return connections[0]?.tenantId;
  }

  /** Finds a customer/contact by name, creating one if none exists. Simple exact-name match — good enough for a single-direction push sync. */
  private async ensureCustomer(
    connection: { provider: AccountingProviderEnum; accessToken: string; externalAccountId: string },
    client: { name: string; email: string | null },
  ): Promise<string> {
    if (connection.provider === "quickbooks") {
      const query = `select Id from Customer where DisplayName = '${client.name.replace(/'/g, "\\'")}'`;
      const found = await this.quickbooksQuery(connection, query);
      const existingId = found?.QueryResponse?.Customer?.[0]?.Id;
      if (existingId) return existingId;

      const created = await this.quickbooksRequest(connection, "POST", "customer", {
        DisplayName: client.name,
        ...(client.email ? { PrimaryEmailAddr: { Address: client.email } } : {}),
      });
      return created.Customer.Id;
    }

    if (connection.provider === "lexoffice") return this.ensureLexofficeContact(connection, client, "customer");

    const found = await this.xeroRequest(connection, "GET", `Contacts?where=${encodeURIComponent(`Name=="${client.name}"`)}`);
    const existingId = found?.Contacts?.[0]?.ContactID;
    if (existingId) return existingId;

    const created = await this.xeroRequest(connection, "POST", "Contacts", {
      Contacts: [{ Name: client.name, ...(client.email ? { EmailAddress: client.email } : {}) }],
    });
    return created.Contacts[0].ContactID;
  }

  /**
   * lexoffice models customer/vendor as roles on one shared Contact resource rather than
   * QuickBooks/Xero's separate Customer and Vendor(-flagged-Contact) lists, so this is the one
   * ensureCustomer/ensureVendor implementation for both. Dedup only works when the client/
   * subcontractor has an email on file (looked up via GET /v1/contacts?email=) — lexoffice's
   * public API has no reliable exact-name filter to fall back on, so a contact with no email
   * gets a fresh lexoffice Contact created on every sync instead of being matched to one already
   * there. Documented limitation, not a bug: see the class doc comment about this connector's
   * confidence level overall.
   */
  private async ensureLexofficeContact(
    connection: { accessToken: string },
    party: { name: string; email: string | null },
    role: "customer" | "vendor",
  ): Promise<string> {
    if (party.email) {
      const found = await this.lexofficeRequest(connection, "GET", `contacts?email=${encodeURIComponent(party.email)}`);
      const existingId = found?.content?.[0]?.id;
      if (existingId) return existingId;
    }

    const created = await this.lexofficeRequest(connection, "POST", "contacts", {
      version: 0,
      roles: { [role]: {} },
      company: { name: party.name },
      ...(party.email ? { emailAddresses: { business: [party.email] } } : {}),
    });
    return created.id;
  }

  /** Same find-by-name-or-create pattern as ensureCustomer(), but for the AP side. QuickBooks keeps
   * Vendors separate from Customers; Xero has one Contact list and marks a contact as a supplier by
   * itself once an ACCPAY invoice is posted against it (IsSupplier "cannot be set via PUT or POST"
   * per its API spec), so on Xero this finds or creates a plain Contact. */
  private async ensureVendor(
    connection: { provider: AccountingProviderEnum; accessToken: string; externalAccountId: string },
    subcontractor: { name: string; email: string | null },
  ): Promise<string> {
    if (connection.provider === "quickbooks") {
      const query = `select Id from Vendor where DisplayName = '${subcontractor.name.replace(/'/g, "\\'")}'`;
      const found = await this.quickbooksQuery(connection, query);
      const existingId = found?.QueryResponse?.Vendor?.[0]?.Id;
      if (existingId) return existingId;

      const created = await this.quickbooksRequest(connection, "POST", "vendor", {
        DisplayName: subcontractor.name,
        ...(subcontractor.email ? { PrimaryEmailAddr: { Address: subcontractor.email } } : {}),
      });
      return created.Vendor.Id;
    }

    const found = await this.xeroRequest(connection, "GET", `Contacts?where=${encodeURIComponent(`Name=="${subcontractor.name}"`)}`);
    const existingId = found?.Contacts?.[0]?.ContactID;
    if (existingId) return existingId;

    const created = await this.xeroRequest(connection, "POST", "Contacts", {
      Contacts: [{ Name: subcontractor.name, ...(subcontractor.email ? { EmailAddress: subcontractor.email } : {}) }],
    });
    return created.Contacts[0].ContactID;
  }

  /**
   * Pushes the bill as a single line for its total — same single-default-account simplification
   * as pushInvoice(). QuickBooks account "64" (Miscellaneous Expense) and Xero account code "400"
   * (conventional default Expense) are each provider's fallback when no per-company mapping exists.
   */
  private async pushBill(
    connection: { provider: AccountingProviderEnum; accessToken: string; externalAccountId: string },
    bill: { description: string; amount: unknown; dueDate: Date | null; currency: string },
    externalVendorId: string,
  ): Promise<string> {
    const dueDate = bill.dueDate ? bill.dueDate.toISOString().slice(0, 10) : undefined;

    if (connection.provider === "quickbooks") {
      const created = await this.quickbooksRequest(connection, "POST", "bill", {
        VendorRef: { value: externalVendorId },
        Line: [
          {
            Amount: Number(bill.amount),
            DetailType: "AccountBasedExpenseLineDetail",
            AccountBasedExpenseLineDetail: { AccountRef: { value: "64" } },
            Description: bill.description,
          },
        ],
        CurrencyRef: { value: bill.currency }, // conditionally required — see pushInvoice
        ...(dueDate ? { DueDate: dueDate } : {}),
      });
      return created.Bill.Id;
    }

    const created = await this.xeroRequest(connection, "POST", "Invoices", {
      Invoices: [
        {
          Type: "ACCPAY",
          Contact: { ContactID: externalVendorId },
          LineItems: [{ Description: bill.description, Quantity: 1, UnitAmount: Number(bill.amount), AccountCode: "400" }],
          Status: "AUTHORISED",
          ...(dueDate ? { DueDate: dueDate } : {}),
        },
      ],
    });
    return created.Invoices[0].InvoiceID;
  }

  /**
   * Pushes the invoice as a single line for its total — a full line-by-line mapping would need
   * a configured default item/account per company, which is out of scope here. QuickBooks item
   * "1" and Xero account code "200" are each provider's conventional default Sales line.
   */
  private async pushInvoice(
    connection: { provider: AccountingProviderEnum; accessToken: string; externalAccountId: string },
    invoice: { number: string; total: unknown; subtotal: unknown; taxAmount: unknown; currency: string; createdAt: Date; dueDate: Date | null },
    externalCustomerId: string,
  ): Promise<string> {
    const dueDate = invoice.dueDate ? invoice.dueDate.toISOString().slice(0, 10) : undefined;

    if (connection.provider === "quickbooks") {
      const created = await this.quickbooksRequest(connection, "POST", "invoice", {
        CustomerRef: { value: externalCustomerId },
        Line: [
          {
            Amount: Number(invoice.total),
            DetailType: "SalesItemLineDetail",
            SalesItemLineDetail: { ItemRef: { value: "1" } },
            Description: `Invoice ${invoice.number}`,
          },
        ],
        // Required when the company has multicurrency on; without it a non-home-currency invoice
        // would land in the home currency. With multicurrency off, QuickBooks rejects a foreign
        // currency outright — an error, which beats a silently mislabeled amount.
        CurrencyRef: { value: invoice.currency },
        ...(dueDate ? { DueDate: dueDate } : {}),
      });
      return created.Invoice.Id;
    }

    if (connection.provider === "lexoffice") {
      // finalize=true issues the invoice for real (Lexware generates its PDF and locks the
      // document) rather than leaving a draft — matching the QuickBooks/Xero paths above, which
      // also push already-decided (non-draft) invoices. Because it's locked on arrival, the
      // amounts have to be right the first time: net amount plus the invoice's own VAT rate, never
      // the gross total at 0%, which would issue a finalized invoice with no VAT on it.
      if (invoice.currency !== "EUR") {
        throw new Error(`Lexware Office only accepts EUR invoices; ${invoice.number} is in ${invoice.currency}`);
      }
      const subtotal = Number(invoice.subtotal);
      const taxRatePercentage = subtotal > 0 ? Math.round((Number(invoice.taxAmount) / subtotal) * 10_000) / 100 : 0;
      const created = await this.lexofficeRequest(connection, "POST", "invoices?finalize=true", {
        archived: false,
        voucherDate: invoice.createdAt.toISOString(),
        address: { contactId: externalCustomerId },
        lineItems: [
          {
            type: "custom",
            name: `Invoice ${invoice.number}`,
            quantity: 1,
            unitName: "Stück",
            unitPrice: { currency: "EUR", netAmount: subtotal, taxRatePercentage },
            discountPercentage: 0,
          },
        ],
        totalPrice: { currency: "EUR" },
        taxConditions: { taxType: "net" },
        // Required by the API. Construction work is a service; the invoice date stands in for the
        // Leistungsdatum, which Cantero doesn't record separately.
        shippingConditions: { shippingType: "service", shippingDate: invoice.createdAt.toISOString() },
      });
      return created.id;
    }

    const created = await this.xeroRequest(connection, "POST", "Invoices", {
      Invoices: [
        {
          Type: "ACCREC",
          Contact: { ContactID: externalCustomerId },
          LineItems: [{ Description: `Invoice ${invoice.number}`, Quantity: 1, UnitAmount: Number(invoice.total), AccountCode: "200" }],
          Status: "AUTHORISED",
          ...(dueDate ? { DueDate: dueDate } : {}),
        },
      ],
    });
    return created.Invoices[0].InvoiceID;
  }

  /** QUICKBOOKS_API_BASE_URL is unset in most environments on purpose — see the constants above.
   * Falling back to sandbox rather than production is the safe default: a misconfigured sandbox
   * URL in production is a loud, obvious no-op (nothing shows up in the real QBO company), while
   * a misconfigured production URL in a dev/test environment would silently write test data into
   * someone's real accounting records. */
  private quickbooksApiBaseUrl(): string {
    return this.config.get<string>("QUICKBOOKS_API_BASE_URL") ?? QUICKBOOKS_SANDBOX_API_BASE_URL;
  }

  private async quickbooksQuery(
    connection: { accessToken: string; externalAccountId: string },
    query: string,
  ): Promise<any> {
    const url = `${this.quickbooksApiBaseUrl()}/v3/company/${connection.externalAccountId}/query?query=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${connection.accessToken}`, Accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`QuickBooks query failed (${res.status})`);
    return res.json();
  }

  private async quickbooksRequest(
    connection: { accessToken: string; externalAccountId: string },
    method: "POST",
    path: string,
    body: unknown,
  ): Promise<any> {
    const url = `${this.quickbooksApiBaseUrl()}/v3/company/${connection.externalAccountId}/${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`QuickBooks ${path} request failed (${res.status})`);
    return res.json();
  }

  private async xeroRequest(
    connection: { accessToken: string; externalAccountId: string },
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<any> {
    const url = `https://api.xero.com/api.xro/2.0/${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
        "Xero-tenant-id": connection.externalAccountId,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Xero ${path} request failed (${res.status})`);
    return res.json();
  }

  /** Unlike QuickBooks/Xero there's no per-company account/tenant path segment or header — a
   * lexoffice Public API Key is scoped to exactly one account, so the bearer token alone is
   * enough context for every request. */
  private async lexofficeRequest(connection: { accessToken: string }, method: "GET" | "POST", path: string, body?: unknown): Promise<any> {
    const url = `${LEXOFFICE_API_BASE_URL}/${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`lexoffice ${path} request failed (${res.status})`);
    return res.json();
  }

  private callbackUrl(provider: AccountingProviderType): string {
    return `${apiOrigin(this.config)}/auth/accounting/callback/${provider}`;
  }
}
