import { JwtService } from "@nestjs/jwt";
import { AccountingSyncService } from "../accounting/accounting-sync.service";
import { fakeProvider, openApiViolations, type OpenApiDoc } from "./harness";
import spec from "./specs/xero-accounting.subset.json";

const doc = spec as unknown as OpenApiDoc;
const XERO = "https://api.xero.com/api.xro/2.0";

describe("Xero Accounting — against the published OpenAPI spec", () => {
  let provider: ReturnType<typeof fakeProvider>;
  let service: AccountingSyncService;
  const prisma = {
    accountingConnection: {
      findUnique: jest.fn().mockResolvedValue({ id: "c", companyId: "co", provider: "xero", accessToken: "AT", refreshToken: "RT", tokenExpiresAt: new Date(Date.now() + 3_600_000), externalAccountId: "tenant-1" }),
    },
    invoice: { findMany: jest.fn(), update: jest.fn() },
    subcontractorCost: { findMany: jest.fn(), update: jest.fn() },
    accountingSyncLog: { create: jest.fn() },
    company: { findUniqueOrThrow: jest.fn().mockResolvedValue({ currency: "EUR" }) },
  };

  beforeEach(() => {
    provider = fakeProvider([
      { method: "GET", url: /\/api\.xro\/2\.0\/Contacts$/, respond: () => ({ body: { Contacts: [] } }) },
      { method: "POST", url: /\/api\.xro\/2\.0\/Contacts$/, respond: () => ({ body: { Contacts: [{ ContactID: "00000000-0000-0000-0000-000000000001" }] } }) },
      { method: "POST", url: /\/api\.xro\/2\.0\/Invoices$/, respond: () => ({ body: { Invoices: [{ InvoiceID: "00000000-0000-0000-0000-00000000000a" }] } }) },
    ]);
    const config = { get: () => undefined, getOrThrow: () => "x" };
    service = new AccountingSyncService(prisma as never, config as never, new JwtService({ secret: "s" }));
  });
  afterEach(() => provider.restore());

  it("pushes a sales invoice: contact and ACCREC invoice bodies both match the schema, tenant header set", async () => {
    prisma.invoice.findMany.mockResolvedValue([
      { id: "i1", number: "INV-0001", total: "1190.00", subtotal: "1000.00", taxAmount: "190.00", currency: "EUR", createdAt: new Date("2026-09-01"), dueDate: new Date("2026-10-01"), client: { name: "Acme GmbH", email: "billing@acme.test" } },
    ]);
    const result = await service.syncInvoices("co");

    expect(result).toEqual({ synced: 1, failed: 0, errors: [] });
    const [lookup, contact, invoice] = provider.calls;
    expect(lookup.url.searchParams.get("where")).toBe('Name=="Acme GmbH"');
    for (const call of provider.calls) expect(call.headers["xero-tenant-id"]).toBe("tenant-1");
    expect(openApiViolations(doc, "POST", "/Contacts", contact.body)).toEqual([]);
    expect(openApiViolations(doc, "POST", "/Invoices", invoice.body)).toEqual([]);
    expect(invoice.url.href).toBe(`${XERO}/Invoices`);
  });

  it("pushes a subcontractor bill as an ACCPAY invoice the schema accepts", async () => {
    prisma.subcontractorCost.findMany.mockResolvedValue([
      { id: "b1", description: "Drywall crew", amount: "4200.00", dueDate: null, subcontractor: { name: "Trockenbau Weber", email: null } },
    ]);
    const result = await service.syncBills("co");

    expect(result).toEqual({ synced: 1, failed: 0, errors: [] });
    const [, contact, bill] = provider.calls;
    // Documented in prose, not as readOnly: IsSupplier/IsCustomer "cannot be set via PUT or POST".
    expect(contact.body.Contacts[0]).not.toHaveProperty("IsSupplier");
    expect(contact.body.Contacts[0]).not.toHaveProperty("IsCustomer");
    expect(openApiViolations(doc, "POST", "/Contacts", contact.body)).toEqual([]);
    expect(openApiViolations(doc, "POST", "/Invoices", bill.body)).toEqual([]);
  });
});
