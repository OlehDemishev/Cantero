import { JwtService } from "@nestjs/jwt";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { AccountingSyncService } from "./accounting-sync.service";

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400) {
  return { ok, status, json: async () => body } as Response;
}

describe("AccountingSyncService", () => {
  let service: AccountingSyncService;
  let prisma: {
    accountingConnection: { findUnique: jest.Mock; upsert: jest.Mock; update: jest.Mock; deleteMany: jest.Mock };
    invoice: { findMany: jest.Mock; update: jest.Mock };
  };
  let config: { get: jest.Mock; getOrThrow: jest.Mock };
  let jwt: JwtService;
  let fetchMock: jest.Mock;

  const CONFIG_VALUES: Record<string, string> = {
    QUICKBOOKS_CLIENT_ID: "qb-client-id",
    QUICKBOOKS_CLIENT_SECRET: "qb-secret",
    XERO_CLIENT_ID: "xero-client-id",
    XERO_CLIENT_SECRET: "xero-secret",
    API_ORIGIN: "http://localhost:4000/api",
  };

  beforeEach(() => {
    prisma = {
      accountingConnection: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn(), deleteMany: jest.fn() },
      invoice: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
    };
    config = {
      get: jest.fn((key: string) => CONFIG_VALUES[key]),
      getOrThrow: jest.fn((key: string) => {
        if (!CONFIG_VALUES[key]) throw new Error(`missing ${key}`);
        return CONFIG_VALUES[key];
      }),
    };
    jwt = new JwtService({ secret: "test-secret" });
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    service = new AccountingSyncService(prisma as never, config as never, jwt);
  });

  describe("getAuthorizeUrl", () => {
    it("throws when the provider's client ID isn't configured", () => {
      config.get.mockImplementation(() => undefined);

      expect(() => service.getAuthorizeUrl("company-a", "quickbooks")).toThrow(BadRequestException);
    });

    it("builds a QuickBooks authorize URL carrying a signed state and the callback redirect_uri", () => {
      const url = service.getAuthorizeUrl("company-a", "quickbooks");
      const parsed = new URL(url);

      expect(parsed.origin + parsed.pathname).toBe("https://appcenter.intuit.com/connect/oauth2");
      expect(parsed.searchParams.get("client_id")).toBe("qb-client-id");
      expect(parsed.searchParams.get("redirect_uri")).toBe("http://localhost:4000/api/auth/accounting/callback/quickbooks");

      const state = parsed.searchParams.get("state")!;
      const decoded = jwt.verify(state) as { companyId: string; provider: string };
      expect(decoded.companyId).toBe("company-a");
      expect(decoded.provider).toBe("quickbooks");
    });
  });

  describe("handleCallback", () => {
    it("rejects a state signed for a different provider", async () => {
      const state = jwt.sign({ companyId: "company-a", provider: "xero" });

      await expect(service.handleCallback("quickbooks", "code", state, "realm-1")).rejects.toThrow(BadRequestException);
    });

    it("rejects a tampered or expired state", async () => {
      await expect(service.handleCallback("quickbooks", "code", "not-a-real-token", "realm-1")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("exchanges the code and stores the connection using the realmId from the callback for QuickBooks", async () => {
      const state = jwt.sign({ companyId: "company-a", provider: "quickbooks" });
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ access_token: "at", refresh_token: "rt", expires_in: 3600 }),
      );

      const result = await service.handleCallback("quickbooks", "auth-code", state, "realm-42");

      expect(result).toEqual({ companyId: "company-a" });
      expect(prisma.accountingConnection.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId: "company-a" },
          create: expect.objectContaining({ externalAccountId: "realm-42", accessToken: "at", refreshToken: "rt" }),
        }),
      );
    });

    it("fetches the tenant ID from /connections for Xero, since it's not on the callback", async () => {
      const state = jwt.sign({ companyId: "company-a", provider: "xero" });
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ access_token: "at", refresh_token: "rt", expires_in: 1800 }))
        .mockResolvedValueOnce(jsonResponse([{ tenantId: "tenant-1", tenantName: "Acme" }]));

      await service.handleCallback("xero", "auth-code", state, undefined);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[1][0]).toBe("https://api.xero.com/connections");
      expect(prisma.accountingConnection.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining({ externalAccountId: "tenant-1" }) }),
      );
    });

    it("throws when the provider rejects the authorization code", async () => {
      const state = jwt.sign({ companyId: "company-a", provider: "quickbooks" });
      fetchMock.mockResolvedValueOnce(jsonResponse({ error: "invalid_grant" }, false, 400));

      await expect(service.handleCallback("quickbooks", "bad-code", state, "realm-1")).rejects.toThrow(BadRequestException);
    });
  });

  describe("getStatus / disconnect", () => {
    it("reports not connected when no row exists", async () => {
      prisma.accountingConnection.findUnique.mockResolvedValue(null);

      await expect(service.getStatus("company-a")).resolves.toEqual({ connected: false });
    });

    it("reports the connection's provider and account when connected", async () => {
      prisma.accountingConnection.findUnique.mockResolvedValue({
        provider: "quickbooks",
        externalAccountId: "realm-1",
        connectedAt: new Date("2026-01-01"),
      });

      const status = await service.getStatus("company-a");

      expect(status).toEqual({
        connected: true,
        provider: "quickbooks",
        externalAccountId: "realm-1",
        connectedAt: new Date("2026-01-01"),
      });
    });

    it("deletes the connection row", async () => {
      await service.disconnect("company-a");

      expect(prisma.accountingConnection.deleteMany).toHaveBeenCalledWith({ where: { companyId: "company-a" } });
    });
  });

  describe("syncInvoices", () => {
    const activeConnection = {
      id: "conn-1",
      companyId: "company-a",
      provider: "quickbooks",
      accessToken: "at",
      refreshToken: "rt",
      tokenExpiresAt: new Date(Date.now() + 3600_000),
      externalAccountId: "realm-1",
    };

    it("throws when there's no connection", async () => {
      prisma.accountingConnection.findUnique.mockResolvedValue(null);

      await expect(service.syncInvoices("company-a")).rejects.toThrow(NotFoundException);
    });

    it("refreshes an expired token before syncing", async () => {
      prisma.accountingConnection.findUnique.mockResolvedValue({
        ...activeConnection,
        tokenExpiresAt: new Date(Date.now() - 1000),
      });
      prisma.accountingConnection.update.mockResolvedValue({
        ...activeConnection,
        accessToken: "new-at",
        tokenExpiresAt: new Date(Date.now() + 3600_000),
      });
      fetchMock.mockResolvedValueOnce(jsonResponse({ access_token: "new-at", refresh_token: "new-rt", expires_in: 3600 }));

      const result = await service.syncInvoices("company-a");

      expect(prisma.accountingConnection.update).toHaveBeenCalled();
      expect(result).toEqual({ synced: 0, failed: 0, errors: [] });
    });

    it("creates the customer, pushes the invoice, and records the external ID", async () => {
      prisma.accountingConnection.findUnique.mockResolvedValue(activeConnection);
      prisma.invoice.findMany.mockResolvedValue([
        { id: "inv-1", number: "INV-0001", total: "1500.00", dueDate: new Date("2026-09-01"), client: { name: "Acme Corp", email: "billing@acme.test" } },
      ]);
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ QueryResponse: {} })) // customer lookup: none found
        .mockResolvedValueOnce(jsonResponse({ Customer: { Id: "cust-9" } })) // customer created
        .mockResolvedValueOnce(jsonResponse({ Invoice: { Id: "qb-inv-7" } })); // invoice created

      const result = await service.syncInvoices("company-a");

      expect(result).toEqual({ synced: 1, failed: 0, errors: [] });
      expect(prisma.invoice.update).toHaveBeenCalledWith({
        where: { id: "inv-1" },
        data: { externalAccountingId: "qb-inv-7", externalAccountingSyncedAt: expect.any(Date) },
      });
    });

    it("reuses an existing customer instead of creating a duplicate", async () => {
      prisma.accountingConnection.findUnique.mockResolvedValue(activeConnection);
      prisma.invoice.findMany.mockResolvedValue([
        { id: "inv-1", number: "INV-0001", total: "1500.00", dueDate: null, client: { name: "Acme Corp", email: null } },
      ]);
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ QueryResponse: { Customer: [{ Id: "cust-existing" }] } }))
        .mockResolvedValueOnce(jsonResponse({ Invoice: { Id: "qb-inv-8" } }));

      await service.syncInvoices("company-a");

      expect(fetchMock).toHaveBeenCalledTimes(2); // lookup + invoice create, no customer-create call
    });

    it("collects one invoice's failure without aborting the rest of the batch", async () => {
      prisma.accountingConnection.findUnique.mockResolvedValue(activeConnection);
      prisma.invoice.findMany.mockResolvedValue([
        { id: "inv-1", number: "INV-0001", total: "100", dueDate: null, client: { name: "Broken Co", email: null } },
        { id: "inv-2", number: "INV-0002", total: "200", dueDate: null, client: { name: "Acme Corp", email: null } },
      ]);
      fetchMock
        .mockResolvedValueOnce(jsonResponse({}, false, 500)) // inv-1 customer lookup fails
        .mockResolvedValueOnce(jsonResponse({ QueryResponse: { Customer: [{ Id: "cust-2" }] } }))
        .mockResolvedValueOnce(jsonResponse({ Invoice: { Id: "qb-inv-2" } }));

      const result = await service.syncInvoices("company-a");

      expect(result.synced).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors[0]).toContain("INV-0001");
      expect(prisma.invoice.update).toHaveBeenCalledTimes(1);
    });
  });
});
