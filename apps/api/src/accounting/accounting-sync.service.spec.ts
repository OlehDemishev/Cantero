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
    subcontractorCost: { findMany: jest.Mock; update: jest.Mock };
    accountingSyncLog: { create: jest.Mock; findMany: jest.Mock };
    company: { findUniqueOrThrow: jest.Mock };
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
      subcontractorCost: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
      accountingSyncLog: { create: jest.fn(), findMany: jest.fn() },
      company: { findUniqueOrThrow: jest.fn().mockResolvedValue({ currency: "EUR" }) },
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

  describe("connectLexoffice", () => {
    it("validates the API key against /v1/profile and stores the connection", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ organizationId: "org-123" }));

      const result = await service.connectLexoffice("company-a", "lexoffice-key");

      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.lexware.io/v1/profile",
        expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer lexoffice-key" }) }),
      );
      expect(prisma.accountingConnection.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId: "company-a" },
          create: expect.objectContaining({ provider: "lexoffice", accessToken: "lexoffice-key", refreshToken: "", externalAccountId: "org-123" }),
        }),
      );
      expect(result).toEqual({ ok: true });
    });

    it("rejects an invalid API key with a clear message instead of a raw status code", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({}, false, 401));

      await expect(service.connectLexoffice("company-a", "bad-key")).rejects.toThrow(BadRequestException);
      expect(prisma.accountingConnection.upsert).not.toHaveBeenCalled();
    });
  });

  describe("getAuthorizeUrl", () => {
    it("throws when the provider's client ID isn't configured", () => {
      config.get.mockImplementation(() => undefined);

      expect(() => service.getAuthorizeUrl("company-a", "quickbooks")).toThrow(BadRequestException);
    });

    it("refuses lexoffice, which connects with an API key instead of OAuth", () => {
      expect(() => service.getAuthorizeUrl("company-a", "lexoffice")).toThrow(BadRequestException);
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
    it("refuses lexoffice, which never reaches this OAuth callback", async () => {
      await expect(service.handleCallback("lexoffice", "code", "state", undefined)).rejects.toThrow(BadRequestException);
    });

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

    it("looks up the lexoffice contact by email, creates and finalizes the invoice", async () => {
      prisma.accountingConnection.findUnique.mockResolvedValue({
        id: "conn-1",
        companyId: "company-a",
        provider: "lexoffice",
        accessToken: "lex-key",
        refreshToken: "",
        tokenExpiresAt: new Date("9999-12-31"),
        externalAccountId: "org-123",
      });
      prisma.invoice.findMany.mockResolvedValue([
        { id: "inv-1", number: "INV-0001", total: "1785.00", subtotal: "1500.00", taxAmount: "285.00", currency: "EUR", createdAt: new Date("2026-09-01"), dueDate: null, client: { name: "Acme GmbH", email: "billing@acme.test" } },
      ]);
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ content: [] })) // contact lookup by email: none found
        .mockResolvedValueOnce(jsonResponse({ id: "contact-9" })) // contact created
        .mockResolvedValueOnce(jsonResponse({ id: "lex-inv-7" })); // invoice created

      const result = await service.syncInvoices("company-a");

      expect(result).toEqual({ synced: 1, failed: 0, errors: [] });
      expect(fetchMock).toHaveBeenNthCalledWith(1, "https://api.lexware.io/v1/contacts?email=billing%40acme.test", expect.anything());
      expect(fetchMock).toHaveBeenNthCalledWith(
        3,
        "https://api.lexware.io/v1/invoices?finalize=true",
        expect.objectContaining({ method: "POST" }),
      );
      expect(prisma.invoice.update).toHaveBeenCalledWith({
        where: { id: "inv-1" },
        data: { externalAccountingId: "lex-inv-7", externalAccountingSyncedAt: expect.any(Date) },
      });
    });

    it("reuses an existing lexoffice contact found by email instead of creating a duplicate", async () => {
      prisma.accountingConnection.findUnique.mockResolvedValue({
        id: "conn-1",
        companyId: "company-a",
        provider: "lexoffice",
        accessToken: "lex-key",
        refreshToken: "",
        tokenExpiresAt: new Date("9999-12-31"),
        externalAccountId: "org-123",
      });
      prisma.invoice.findMany.mockResolvedValue([
        { id: "inv-1", number: "INV-0001", total: "1785.00", subtotal: "1500.00", taxAmount: "285.00", currency: "EUR", createdAt: new Date("2026-09-01"), dueDate: null, client: { name: "Acme GmbH", email: "billing@acme.test" } },
      ]);
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ content: [{ id: "contact-existing" }] }))
        .mockResolvedValueOnce(jsonResponse({ id: "lex-inv-8" }));

      await service.syncInvoices("company-a");

      expect(fetchMock).toHaveBeenCalledTimes(2); // lookup + invoice create, no contact-create call
    });

    it("refuses a non-EUR invoice for lexoffice instead of labeling foreign amounts as EUR", async () => {
      prisma.accountingConnection.findUnique.mockResolvedValue({
        id: "conn-1",
        companyId: "company-a",
        provider: "lexoffice",
        accessToken: "lex-key",
        refreshToken: "",
        tokenExpiresAt: new Date("9999-12-31"),
        externalAccountId: "org-123",
      });
      prisma.invoice.findMany.mockResolvedValue([
        { id: "inv-1", number: "INV-0001", total: "1190", subtotal: "1000", taxAmount: "190", currency: "PLN", createdAt: new Date("2026-09-01"), dueDate: null, client: { name: "Acme", email: "a@acme.test" } },
      ]);
      fetchMock.mockResolvedValueOnce(jsonResponse({ content: [{ id: "contact-existing" }] }));

      const result = await service.syncInvoices("company-a");

      expect(result.failed).toBe(1);
      expect(result.errors[0]).toMatch(/EUR/);
      expect(fetchMock).toHaveBeenCalledTimes(1); // only the contact lookup — no invoice was posted
    });

    it("logs a sync attempt for every invoice, success and failure alike", async () => {
      prisma.accountingConnection.findUnique.mockResolvedValue(activeConnection);
      prisma.invoice.findMany.mockResolvedValue([
        { id: "inv-1", number: "INV-0001", total: "100", dueDate: null, client: { name: "Broken Co", email: null } },
        { id: "inv-2", number: "INV-0002", total: "200", dueDate: null, client: { name: "Acme Corp", email: null } },
      ]);
      fetchMock
        .mockResolvedValueOnce(jsonResponse({}, false, 500))
        .mockResolvedValueOnce(jsonResponse({ QueryResponse: { Customer: [{ Id: "cust-2" }] } }))
        .mockResolvedValueOnce(jsonResponse({ Invoice: { Id: "qb-inv-2" } }));

      await service.syncInvoices("company-a");

      expect(prisma.accountingSyncLog.create).toHaveBeenCalledTimes(2);
      expect(prisma.accountingSyncLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ invoiceNumber: "INV-0001", status: "failed" }) }),
      );
      expect(prisma.accountingSyncLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ invoiceNumber: "INV-0002", status: "success" }) }),
      );
    });

    it("defaults to the QuickBooks sandbox API host when QUICKBOOKS_API_BASE_URL isn't set", async () => {
      prisma.accountingConnection.findUnique.mockResolvedValue(activeConnection);
      prisma.invoice.findMany.mockResolvedValue([
        { id: "inv-1", number: "INV-0001", total: "100", dueDate: null, client: { name: "Acme Corp", email: null } },
      ]);
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ QueryResponse: { Customer: [{ Id: "cust-1" }] } }))
        .mockResolvedValueOnce(jsonResponse({ Invoice: { Id: "qb-inv-1" } }));

      await service.syncInvoices("company-a");

      for (const call of fetchMock.mock.calls) {
        expect(call[0]).toMatch(/^https:\/\/sandbox-quickbooks\.api\.intuit\.com\//);
      }
    });

    it("uses QUICKBOOKS_API_BASE_URL when set, so a real deployment can point at production", async () => {
      config.get.mockImplementation((key: string) => (key === "QUICKBOOKS_API_BASE_URL" ? "https://quickbooks.api.intuit.com" : CONFIG_VALUES[key]));
      prisma.accountingConnection.findUnique.mockResolvedValue(activeConnection);
      prisma.invoice.findMany.mockResolvedValue([
        { id: "inv-1", number: "INV-0001", total: "100", dueDate: null, client: { name: "Acme Corp", email: null } },
      ]);
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ QueryResponse: { Customer: [{ Id: "cust-1" }] } }))
        .mockResolvedValueOnce(jsonResponse({ Invoice: { Id: "qb-inv-1" } }));

      await service.syncInvoices("company-a");

      for (const call of fetchMock.mock.calls) {
        expect(call[0]).toMatch(/^https:\/\/quickbooks\.api\.intuit\.com\//);
      }
    });
  });

  describe("syncBills", () => {
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
      await expect(service.syncBills("company-a")).rejects.toThrow(NotFoundException);
    });

    it("refuses to sync bills to lexoffice, which isn't supported yet", async () => {
      prisma.accountingConnection.findUnique.mockResolvedValue({
        id: "conn-1",
        companyId: "company-a",
        provider: "lexoffice",
        accessToken: "lex-key",
        refreshToken: "",
        tokenExpiresAt: new Date("9999-12-31"),
        externalAccountId: "org-123",
      });

      await expect(service.syncBills("company-a")).rejects.toThrow(BadRequestException);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("creates the vendor, pushes the bill, and records the external ID", async () => {
      prisma.accountingConnection.findUnique.mockResolvedValue(activeConnection);
      prisma.subcontractorCost.findMany.mockResolvedValue([
        {
          id: "cost-1",
          description: "Electrical rough-in",
          amount: "2500.00",
          dueDate: new Date("2026-09-01"),
          subcontractor: { name: "ElectroPro LLC", email: "billing@electropro.test" },
        },
      ]);
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ QueryResponse: {} })) // vendor lookup: none found
        .mockResolvedValueOnce(jsonResponse({ Vendor: { Id: "vendor-9" } })) // vendor created
        .mockResolvedValueOnce(jsonResponse({ Bill: { Id: "qb-bill-7" } })); // bill created

      const result = await service.syncBills("company-a");

      expect(result).toEqual({ synced: 1, failed: 0, errors: [] });
      expect(prisma.subcontractorCost.update).toHaveBeenCalledWith({
        where: { id: "cost-1" },
        data: { externalAccountingId: "qb-bill-7", externalAccountingSyncedAt: expect.any(Date) },
      });
    });

    it("reuses an existing vendor instead of creating a duplicate", async () => {
      prisma.accountingConnection.findUnique.mockResolvedValue(activeConnection);
      prisma.subcontractorCost.findMany.mockResolvedValue([
        { id: "cost-1", description: "Framing", amount: "800", dueDate: null, subcontractor: { name: "FrameCo", email: null } },
      ]);
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ QueryResponse: { Vendor: [{ Id: "vendor-existing" }] } }))
        .mockResolvedValueOnce(jsonResponse({ Bill: { Id: "qb-bill-8" } }));

      await service.syncBills("company-a");

      expect(fetchMock).toHaveBeenCalledTimes(2); // lookup + bill create, no vendor-create call
    });

    it("collects one bill's failure without aborting the rest of the batch", async () => {
      prisma.accountingConnection.findUnique.mockResolvedValue(activeConnection);
      prisma.subcontractorCost.findMany.mockResolvedValue([
        { id: "cost-1", description: "Broken", amount: "100", dueDate: null, subcontractor: { name: "Broken Co", email: null } },
        { id: "cost-2", description: "OK", amount: "200", dueDate: null, subcontractor: { name: "FrameCo", email: null } },
      ]);
      fetchMock
        .mockResolvedValueOnce(jsonResponse({}, false, 500))
        .mockResolvedValueOnce(jsonResponse({ QueryResponse: { Vendor: [{ Id: "vendor-2" }] } }))
        .mockResolvedValueOnce(jsonResponse({ Bill: { Id: "qb-bill-2" } }));

      const result = await service.syncBills("company-a");

      expect(result.synced).toBe(1);
      expect(result.failed).toBe(1);
      expect(prisma.subcontractorCost.update).toHaveBeenCalledTimes(1);
    });
  });

  describe("syncHistory", () => {
    it("returns recent log entries newest-first", async () => {
      prisma.accountingSyncLog.findMany.mockResolvedValue([{ id: "log-1" }]);

      const result = await service.syncHistory("company-a");

      expect(prisma.accountingSyncLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { companyId: "company-a" }, orderBy: { attemptedAt: "desc" } }),
      );
      expect(result).toEqual([{ id: "log-1" }]);
    });
  });

  describe("integrityCheck", () => {
    it("reports not-connected with empty lists when no accounting connection exists", async () => {
      prisma.accountingConnection.findUnique.mockResolvedValue(null);
      prisma.invoice.findMany.mockResolvedValue([]);
      prisma.accountingSyncLog.findMany.mockResolvedValue([]);

      const result = await service.integrityCheck("company-a");

      expect(result.connected).toBe(false);
      expect(result.provider).toBeNull();
    });

    it("lists unsynced invoices and recent failures when connected", async () => {
      prisma.accountingConnection.findUnique.mockResolvedValue({ provider: "quickbooks" });
      prisma.invoice.findMany.mockResolvedValue([{ id: "inv-1", number: "INV-0001", total: "500", createdAt: new Date() }]);
      prisma.accountingSyncLog.findMany.mockResolvedValue([{ id: "log-1", status: "failed", invoiceNumber: "INV-0002" }]);

      const result = await service.integrityCheck("company-a");

      expect(result.connected).toBe(true);
      expect(result.provider).toBe("quickbooks");
      expect(result.unsyncedInvoices).toHaveLength(1);
      expect(result.recentFailures).toHaveLength(1);
    });

    it("also lists unsynced bills (AP side) alongside unsynced invoices", async () => {
      prisma.accountingConnection.findUnique.mockResolvedValue({ provider: "quickbooks" });
      prisma.subcontractorCost.findMany.mockResolvedValue([
        { id: "cost-1", description: "Framing", amount: "800", incurredDate: new Date(), subcontractor: { name: "FrameCo" } },
      ]);

      const result = await service.integrityCheck("company-a");

      expect(result.unsyncedBills).toHaveLength(1);
    });

    it("skips the unsynced-bills query for lexoffice, since syncBills isn't supported there", async () => {
      prisma.accountingConnection.findUnique.mockResolvedValue({ provider: "lexoffice" });

      const result = await service.integrityCheck("company-a");

      expect(result.unsyncedBills).toEqual([]);
      expect(prisma.subcontractorCost.findMany).not.toHaveBeenCalled();
    });
  });
});
