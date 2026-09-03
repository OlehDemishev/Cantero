import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { AccountingProvider as AccountingProviderEnum } from "@prisma/client";
import type { AccountingProviderType } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";

const FETCH_TIMEOUT_MS = 10_000;
const STATE_TTL = "10m";

interface ProviderConfig {
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  clientIdKey: string;
  clientSecretKey: string;
}

const PROVIDERS: Record<AccountingProviderType, ProviderConfig> = {
  quickbooks: {
    authorizeUrl: "https://appcenter.intuit.com/connect/oauth2",
    tokenUrl: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
    scope: "com.intuit.quickbooks.accounting",
    clientIdKey: "QUICKBOOKS_CLIENT_ID",
    clientSecretKey: "QUICKBOOKS_CLIENT_SECRET",
  },
  xero: {
    authorizeUrl: "https://login.xero.com/identity/connect/authorize",
    tokenUrl: "https://identity.xero.com/connect/token",
    scope: "accounting.transactions accounting.contacts offline_access",
    clientIdKey: "XERO_CLIENT_ID",
    clientSecretKey: "XERO_CLIENT_SECRET",
  },
};

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface SyncSummary {
  synced: number;
  failed: number;
  errors: string[];
}

/**
 * Live OAuth2 sync with QuickBooks Online / Xero: connect via authorization-code flow, push
 * unsynced invoices (creating the customer first if needed), track the external ID for
 * idempotency. Each provider needs its own app registered with Intuit/Xero (CLIENT_ID/SECRET
 * env vars) — with neither configured, getAuthorizeUrl fails fast with a clear error instead
 * of building a redirect that would 404 at the provider.
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

  getAuthorizeUrl(companyId: string, provider: AccountingProviderType): string {
    const cfg = PROVIDERS[provider];
    const clientId = this.config.get<string>(cfg.clientIdKey);
    if (!clientId) {
      throw new BadRequestException(
        `${provider === "quickbooks" ? "QuickBooks" : "Xero"} isn't configured on this server — set ${cfg.clientIdKey}/${cfg.clientSecretKey}`,
      );
    }

    const state = this.jwt.sign({ companyId, provider }, { expiresIn: STATE_TTL });
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
    let decoded: { companyId: string; provider: AccountingProviderType };
    try {
      decoded = this.jwt.verify(state);
    } catch {
      throw new BadRequestException("This connection link has expired — try connecting again");
    }
    if (decoded.provider !== provider) throw new BadRequestException("Provider mismatch");

    const tokens = await this.exchangeCode(provider, code);
    const externalAccountId = provider === "quickbooks" ? realmId : await this.fetchXeroTenantId(tokens.access_token);
    if (!externalAccountId) throw new BadRequestException("The provider didn't return an account identifier");

    await this.prisma.accountingConnection.upsert({
      where: { companyId: decoded.companyId },
      create: {
        companyId: decoded.companyId,
        provider: provider as AccountingProviderEnum,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        externalAccountId,
      },
      update: {
        provider: provider as AccountingProviderEnum,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
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
    const fresh = await this.ensureFreshToken(connection);

    const bills = await this.prisma.subcontractorCost.findMany({
      where: { companyId, externalAccountingId: null },
      include: { subcontractor: true },
    });

    const summary: SyncSummary = { synced: 0, failed: 0, errors: [] };
    for (const bill of bills) {
      const reference = `${bill.subcontractor.name} — ${bill.description}`;
      try {
        const externalVendorId = await this.ensureVendor(fresh, bill.subcontractor);
        const externalBillId = await this.pushBill(fresh, bill, externalVendorId);
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
   * without requiring the user to comb through every invoice by hand. */
  async integrityCheck(companyId: string) {
    const connection = await this.prisma.accountingConnection.findUnique({ where: { companyId } });
    const [unsyncedInvoices, unsyncedBills, recentFailures] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { companyId, externalAccountingId: null, status: { not: "draft" } },
        select: { id: true, number: true, total: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.subcontractorCost.findMany({
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
    return connection;
  }

  /** Refreshes and persists the access token when it's expired (or about to), so callers always get a usable one. */
  private async ensureFreshToken(connection: {
    id: string;
    companyId: string;
    provider: AccountingProviderEnum;
    accessToken: string;
    refreshToken: string;
    tokenExpiresAt: Date;
    externalAccountId: string;
  }) {
    if (connection.tokenExpiresAt.getTime() - Date.now() > 60_000) return connection;

    const provider = connection.provider as AccountingProviderType;
    const cfg = PROVIDERS[provider];
    const clientId = this.config.getOrThrow<string>(cfg.clientIdKey);
    const clientSecret = this.config.getOrThrow<string>(cfg.clientSecretKey);

    const res = await fetch(cfg.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: connection.refreshToken }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new BadRequestException("Failed to refresh the accounting connection — reconnect it in Settings");
    const tokens = (await res.json()) as TokenResponse;

    return this.prisma.accountingConnection.update({
      where: { id: connection.id },
      data: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      },
    });
  }

  private async exchangeCode(provider: AccountingProviderType, code: string): Promise<TokenResponse> {
    const cfg = PROVIDERS[provider];
    const clientId = this.config.getOrThrow<string>(cfg.clientIdKey);
    const clientSecret = this.config.getOrThrow<string>(cfg.clientSecretKey);

    const res = await fetch(cfg.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: this.callbackUrl(provider) }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new BadRequestException(`${provider} rejected the authorization code`);
    return (await res.json()) as TokenResponse;
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

    const found = await this.xeroRequest(connection, "GET", `Contacts?where=${encodeURIComponent(`Name=="${client.name}"`)}`);
    const existingId = found?.Contacts?.[0]?.ContactID;
    if (existingId) return existingId;

    const created = await this.xeroRequest(connection, "POST", "Contacts", {
      Contacts: [{ Name: client.name, ...(client.email ? { EmailAddress: client.email } : {}) }],
    });
    return created.Contacts[0].ContactID;
  }

  /** Same find-by-name-or-create pattern as ensureCustomer(), but for the AP side: a QuickBooks
   * Vendor or a Xero Contact flagged IsSupplier — neither provider shares its AR contact list
   * with the AP one, so this is a genuinely separate lookup even for a name that also exists as
   * a customer. */
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
      Contacts: [{ Name: subcontractor.name, IsSupplier: true, ...(subcontractor.email ? { EmailAddress: subcontractor.email } : {}) }],
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
    bill: { description: string; amount: unknown; dueDate: Date | null },
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
    invoice: { number: string; total: unknown; dueDate: Date | null },
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
        ...(dueDate ? { DueDate: dueDate } : {}),
      });
      return created.Invoice.Id;
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

  private async quickbooksQuery(
    connection: { accessToken: string; externalAccountId: string },
    query: string,
  ): Promise<any> {
    const url = `https://sandbox-quickbooks.api.intuit.com/v3/company/${connection.externalAccountId}/query?query=${encodeURIComponent(query)}`;
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
    const url = `https://sandbox-quickbooks.api.intuit.com/v3/company/${connection.externalAccountId}/${path}`;
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

  private callbackUrl(provider: AccountingProviderType): string {
    const apiOrigin = this.config.get<string>("API_ORIGIN") ?? "http://localhost:4000/api";
    return `${apiOrigin}/auth/accounting/callback/${provider}`;
  }
}
