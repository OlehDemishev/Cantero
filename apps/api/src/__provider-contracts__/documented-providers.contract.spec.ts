import { JwtService } from "@nestjs/jwt";
import { MsProjectService } from "../projects/ms-project.service";
import { AutodeskService } from "../projects/autodesk.service";
import { AccountingSyncService } from "../accounting/accounting-sync.service";
import { documentedViolations, fakeProvider } from "./harness";
import { autodesk, lexware, msProject, quickbooks } from "./documented-rules";

const future = () => new Date(Date.now() + 3_600_000);
const config = { get: () => undefined, getOrThrow: () => "x" } as never;

describe("MS Project (Project for the Web) — Microsoft's Project schedule API contract", () => {
  const ENV = "https://org1.crm4.dynamics.com";
  const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
  const BUCKET_ID = "22222222-2222-2222-2222-222222222222";
  const OPSET_ID = "33333333-3333-3333-3333-333333333333";
  let provider: ReturnType<typeof fakeProvider>;
  let bucketExists: boolean;
  const prisma = {
    msProjectConnection: { findUnique: jest.fn().mockResolvedValue({ id: "c", companyId: "co", accessToken: "AT", refreshToken: "RT", tokenExpiresAt: future(), environmentUrl: ENV }) },
    project: { findFirst: jest.fn(), update: jest.fn() },
    task: { findMany: jest.fn(), update: jest.fn((a: unknown) => a) },
    $transaction: jest.fn(async (ops: unknown[]) => ops),
  };
  const service = new MsProjectService(prisma as never, config, new JwtService({ secret: "s" }));
  const bodiesFor = (action: string) => provider.calls.filter((c) => c.url.pathname.endsWith(`/api/data/v9.2/${action}`)).map((c) => c.body);

  beforeEach(() => {
    bucketExists = true;
    prisma.task.findMany.mockResolvedValue([
      { id: "t1", name: "Framing", startDate: new Date("2026-10-01"), dueDate: new Date("2026-10-10") },
      { id: "t2", name: "Roofing", startDate: null, dueDate: null },
    ]);
    provider = fakeProvider([
      { method: "POST", url: /\/msdyn_CreateProjectV1$/, respond: () => ({ body: { ProjectId: PROJECT_ID } }) },
      { method: "GET", url: /\/msdyn_projectbuckets$/, respond: () => ({ body: { value: bucketExists ? [{ msdyn_projectbucketid: BUCKET_ID }] : [] } }) },
      { method: "POST", url: /\/msdyn_CreateOperationSetV1$/, respond: () => ({ body: { OperationSetId: OPSET_ID } }) },
      { method: "POST", url: /\/msdyn_PssCreateV1$/, respond: () => ({ body: { OperationSetResponse: "{}" } }) },
      { method: "POST", url: /\/msdyn_ExecuteOperationSetV1$/, respond: () => ({ body: { OperationSetResponse: "{}" } }) },
    ]);
  });
  afterEach(() => provider.restore());

  it("the rules reject what the connector used to send: a plain POST body with a misnamed binding", () => {
    expect(documentedViolations(msProject.taskEntity, { msdyn_subject: "x", "msdyn_ProjectId@odata.bind": `/msdyn_projects(${PROJECT_ID})` })).toEqual(
      expect.arrayContaining([expect.stringContaining("msdyn_project@odata.bind is required"), expect.stringContaining("msdyn_ProjectId@odata.bind is not a documented field")]),
    );
  });

  it("creates the project, opens one operation set, queues each task into the existing bucket, then executes it", async () => {
    prisma.project.findFirst.mockResolvedValue({ id: "p1", name: "Haus 1", msProjectExternalId: null });
    const summary = await service.syncProject("co", "p1");

    expect(summary).toEqual({ synced: 2, failed: 0, errors: [] });
    const actions = provider.calls.map((c) => c.url.pathname.split("/").pop());
    expect(actions).toEqual(["msdyn_CreateProjectV1", "msdyn_projectbuckets", "msdyn_CreateOperationSetV1", "msdyn_PssCreateV1", "msdyn_PssCreateV1", "msdyn_ExecuteOperationSetV1"]);

    expect(documentedViolations(msProject.createProjectV1, bodiesFor("msdyn_CreateProjectV1")[0])).toEqual([]);
    expect(bodiesFor("msdyn_CreateProjectV1")[0].Project["@odata.type"]).toBe("Microsoft.Dynamics.CRM.msdyn_project");
    expect(documentedViolations(msProject.createOperationSetV1, bodiesFor("msdyn_CreateOperationSetV1")[0])).toEqual([]);
    for (const body of bodiesFor("msdyn_PssCreateV1")) {
      expect(documentedViolations(msProject.pssCreateV1, body)).toEqual([]);
      expect(body.Entity["@odata.type"]).toBe("Microsoft.Dynamics.CRM.msdyn_projecttask");
      expect(documentedViolations(msProject.taskEntity, body.Entity)).toEqual([]);
      expect(body.Entity["msdyn_projectbucket@odata.bind"]).toBe(`/msdyn_projectbuckets(${BUCKET_ID})`);
      expect(body.OperationSetId).toBe(OPSET_ID);
    }
    expect(documentedViolations(msProject.executeOperationSetV1, bodiesFor("msdyn_ExecuteOperationSetV1")[0])).toEqual([]);
    const bucketQuery = provider.calls[1].url.searchParams.get("$filter");
    expect(bucketQuery).toBe(`_msdyn_project_value eq ${PROJECT_ID}`);
  });

  it("queues a bucket first when the project has none", async () => {
    bucketExists = false;
    prisma.project.findFirst.mockResolvedValue({ id: "p1", name: "Haus 1", msProjectExternalId: PROJECT_ID });
    await service.syncProject("co", "p1");

    const [bucket, ...tasks] = bodiesFor("msdyn_PssCreateV1");
    expect(bucket.Entity["@odata.type"]).toBe("Microsoft.Dynamics.CRM.msdyn_projectbucket");
    expect(documentedViolations(msProject.bucketEntity, bucket.Entity)).toEqual([]);
    for (const t of tasks) expect(t.Entity["msdyn_projectbucket@odata.bind"]).toBe(`/msdyn_projectbuckets(${bucket.Entity.msdyn_projectbucketid})`);
  });

  it("never puts more than the documented 200 operations into one set", async () => {
    prisma.project.findFirst.mockResolvedValue({ id: "p1", name: "Haus 1", msProjectExternalId: PROJECT_ID });
    prisma.task.findMany.mockResolvedValue(Array.from({ length: 450 }, (_, i) => ({ id: `t${i}`, name: `Task ${i}`, startDate: null, dueDate: null })));
    const summary = await service.syncProject("co", "p1");

    expect(summary.synced).toBe(450);
    let open = 0;
    let max = 0;
    for (const c of provider.calls) {
      const action = c.url.pathname.split("/").pop();
      if (action === "msdyn_CreateOperationSetV1") open = 0;
      if (action === "msdyn_PssCreateV1") max = Math.max(max, ++open);
    }
    expect(max).toBeLessThanOrEqual(msProject.operationSetLimit);
    expect(bodiesFor("msdyn_ExecuteOperationSetV1")).toHaveLength(3);
  });

  it("marks nothing synced when the operation set fails to execute", async () => {
    prisma.project.findFirst.mockResolvedValue({ id: "p1", name: "Haus 1", msProjectExternalId: PROJECT_ID });
    provider.restore();
    provider = fakeProvider([
      { method: "GET", url: /\/msdyn_projectbuckets$/, respond: () => ({ body: { value: [{ msdyn_projectbucketid: BUCKET_ID }] } }) },
      { method: "POST", url: /\/msdyn_CreateOperationSetV1$/, respond: () => ({ body: { OperationSetId: OPSET_ID } }) },
      { method: "POST", url: /\/msdyn_PssCreateV1$/, respond: () => ({ body: {} }) },
      { method: "POST", url: /\/msdyn_ExecuteOperationSetV1$/, respond: () => ({ status: 400, body: { error: { message: "Only users with a Project license can use the schedule APIs" } } }) },
    ]);
    prisma.task.update.mockClear();
    const summary = await service.syncProject("co", "p1");

    expect(summary).toMatchObject({ synced: 0, failed: 2 });
    expect(summary.errors[0]).toContain("Project license");
    expect(prisma.task.update).not.toHaveBeenCalled();
  });
});

describe("Lexware Office (lexoffice) — developers.lexware.io contract", () => {
  let provider: ReturnType<typeof fakeProvider>;
  const prisma = {
    accountingConnection: { findUnique: jest.fn().mockResolvedValue({ id: "c", companyId: "co", provider: "lexoffice", accessToken: "KEY", refreshToken: "", tokenExpiresAt: new Date("9999-12-31"), externalAccountId: "org" }) },
    invoice: { findMany: jest.fn(), update: jest.fn() },
    accountingSyncLog: { create: jest.fn() },
  };
  const service = new AccountingSyncService(prisma as never, config, new JwtService({ secret: "s" }));

  beforeEach(() => {
    provider = fakeProvider([
      { method: "GET", url: /^https:\/\/api\.lexware\.io\/v1\/contacts$/, respond: () => ({ body: { content: [] } }) },
      { method: "POST", url: /^https:\/\/api\.lexware\.io\/v1\/contacts$/, respond: () => ({ body: { id: "e9066f04-8cc7-4616-93f8-ac9ecc8479c8", resourceUri: "https://api.lexware.io/v1/contacts/e9066f04-8cc7-4616-93f8-ac9ecc8479c8", createdDate: "2026-09-21T10:00:00.000+02:00", updatedDate: "2026-09-21T10:00:00.000+02:00", version: 1 } }) },
      { method: "POST", url: /^https:\/\/api\.lexware\.io\/v1\/invoices$/, respond: () => ({ body: { id: "66196c43-bfee-baf3-4335-d610367059db", resourceUri: "https://api.lexware.io/v1/invoices/66196c43-bfee-baf3-4335-d610367059db", version: 1 } }) },
    ]);
  });
  afterEach(() => provider.restore());

  it("talks to the api.lexware.io gateway (api.lexoffice.io was retired in December 2025)", async () => {
    prisma.invoice.findMany.mockResolvedValue([
      { id: "i1", number: "INV-0001", total: "1190.00", subtotal: "1000.00", taxAmount: "190.00", currency: "EUR", createdAt: new Date("2026-09-01T00:00:00Z"), dueDate: null, client: { name: "Acme GmbH", email: "a@acme.test" } },
    ]);
    await service.syncInvoices("co");
    for (const call of provider.calls) expect(call.url.origin).toBe(new URL(lexware.baseUrl).origin);
  });

  it("creates the contact and a finalized invoice with every documented required field, net amount plus the real VAT rate", async () => {
    prisma.invoice.findMany.mockResolvedValue([
      { id: "i1", number: "INV-0001", total: "1190.00", subtotal: "1000.00", taxAmount: "190.00", currency: "EUR", createdAt: new Date("2026-09-01T00:00:00Z"), dueDate: null, client: { name: "Acme GmbH", email: "a@acme.test" } },
    ]);
    const result = await service.syncInvoices("co");

    expect(result).toEqual({ synced: 1, failed: 0, errors: [] });
    const [, contact, invoice] = provider.calls;
    expect(documentedViolations(lexware.createContact, contact.body)).toEqual([]);
    expect(invoice.url.searchParams.get("finalize")).toBe("true");
    expect(documentedViolations(lexware.createInvoice, invoice.body)).toEqual([]);
    expect(invoice.body.lineItems[0].unitPrice).toEqual({ currency: "EUR", netAmount: 1000, taxRatePercentage: 19 });
  });

  it("the rules reject what the connector used to send: no shippingConditions", () => {
    expect(documentedViolations(lexware.createInvoice, { voucherDate: "x", address: { contactId: "c" }, lineItems: [], totalPrice: { currency: "EUR" }, taxConditions: { taxType: "net" } })).toEqual(
      expect.arrayContaining([expect.stringContaining("shippingConditions.shippingType is required")]),
    );
  });
});

describe("Autodesk Construction Cloud Issues — APS POST issues contract", () => {
  const RAW = "a4be0c34-4ab7-4a3b-9c1d-2e3f4a5b6c7d";
  const SUBTYPE_PUNCH = "2220f222-6c54-4b01-90e6-d701748f0222";
  let provider: ReturnType<typeof fakeProvider>;
  const prisma = {
    autodeskConnection: { findUnique: jest.fn().mockResolvedValue({ id: "c", companyId: "co", accessToken: "AT", refreshToken: "RT", tokenExpiresAt: future(), hubId: "b.hub" }) },
    project: { findFirst: jest.fn().mockResolvedValue({ id: "p1", autodeskProjectId: `b.${RAW}` }), update: jest.fn() },
    punchListItem: { findMany: jest.fn(), update: jest.fn() },
  };
  const service = new AutodeskService(prisma as never, config, new JwtService({ secret: "s" }));

  beforeEach(() => {
    provider = fakeProvider([
      {
        method: "GET",
        url: /\/construction\/issues\/v1\/projects\/[^/]+\/issue-types$/,
        // Shape from the documented GET issue-types example, with a second category added.
        respond: () => ({
          body: {
            pagination: { limit: 200, offset: 0, totalResults: 2 },
            results: [
              { id: "1110f111-6c54-4b01-90e6-d701748f1111", title: "Coordination", isActive: true, subtypes: [{ id: "3330f333-6c54-4b01-90e6-d701748f0333", title: "Clash", isActive: true, isReadOnly: false }] },
              { id: "4440f444-6c54-4b01-90e6-d701748f4444", title: "Quality", isActive: true, subtypes: [{ id: SUBTYPE_PUNCH, title: "Punch List", isActive: true, isReadOnly: false }] },
            ],
          },
        }),
      },
      { method: "POST", url: /\/construction\/issues\/v1\/projects\/[^/]+\/issues$/, respond: () => ({ status: 201, body: { id: "9990f999-6c54-4b01-90e6-d701748f9999" } }) },
    ]);
  });
  afterEach(() => provider.restore());

  it("strips the b. prefix, files each item under the punch-list type, with a documented status, published", async () => {
    prisma.punchListItem.findMany.mockResolvedValue([
      { id: "pl1", title: "Crack in slab at C/4", description: null, status: "resolved", dueDate: new Date("2026-10-01") },
      { id: "pl2", title: "x".repeat(140), description: "y".repeat(1400), status: "open", dueDate: null },
    ]);
    const summary = await service.syncPunchList("co", "p1", `b.${RAW}`);

    expect(summary).toEqual({ synced: 2, failed: 0, errors: [] });
    const posts = provider.calls.filter((c) => c.method === "POST");
    for (const call of provider.calls) expect(call.url.pathname.split("/")[5]).toMatch(autodesk.projectIdInPath);
    for (const post of posts) {
      expect(documentedViolations(autodesk.createIssue, post.body)).toEqual([]);
      expect(post.body.issueSubtypeId).toBe(SUBTYPE_PUNCH);
      expect(post.body.published).toBe(true);
    }
    expect(posts[0].body.status).toBe("completed");
  });

  it("the rules reject what the connector used to send: no subtype and a status Autodesk doesn't have", () => {
    expect(documentedViolations(autodesk.createIssue, { title: "Crack", status: "resolved" })).toEqual(
      expect.arrayContaining([expect.stringContaining("issueSubtypeId is required"), expect.stringContaining('"resolved" is not one of')]),
    );
  });
});

describe("QuickBooks Online — Invoice / Bill / Customer / Vendor contract", () => {
  let provider: ReturnType<typeof fakeProvider>;
  const prisma = {
    accountingConnection: { findUnique: jest.fn().mockResolvedValue({ id: "c", companyId: "co", provider: "quickbooks", accessToken: "AT", refreshToken: "RT", tokenExpiresAt: future(), externalAccountId: "9130" }) },
    invoice: { findMany: jest.fn(), update: jest.fn() },
    subcontractorCost: { findMany: jest.fn(), update: jest.fn() },
    accountingSyncLog: { create: jest.fn() },
    company: { findUniqueOrThrow: jest.fn().mockResolvedValue({ currency: "USD" }) },
  };
  const service = new AccountingSyncService(prisma as never, config, new JwtService({ secret: "s" }));

  beforeEach(() => {
    provider = fakeProvider([
      { method: "GET", url: /\/v3\/company\/9130\/query$/, respond: () => ({ body: { QueryResponse: {}, time: "2026-09-21T10:00:00.000-07:00" } }) },
      { method: "POST", url: /\/v3\/company\/9130\/customer$/, respond: () => ({ body: { Customer: { Id: "58", DisplayName: "Acme Corp" } } }) },
      { method: "POST", url: /\/v3\/company\/9130\/vendor$/, respond: () => ({ body: { Vendor: { Id: "56", DisplayName: "Drywall Co" } } }) },
      { method: "POST", url: /\/v3\/company\/9130\/invoice$/, respond: () => ({ body: { Invoice: { Id: "130", SyncToken: "0" } } }) },
      { method: "POST", url: /\/v3\/company\/9130\/bill$/, respond: () => ({ body: { Bill: { Id: "252", SyncToken: "0" } } }) },
    ]);
  });
  afterEach(() => provider.restore());

  it("creates a customer and an invoice with every documented required field, in the invoice's own currency", async () => {
    prisma.invoice.findMany.mockResolvedValue([
      { id: "i1", number: "INV-0001", total: "1070.00", subtotal: "1000.00", taxAmount: "70.00", currency: "USD", createdAt: new Date(), dueDate: new Date("2026-10-01"), client: { name: "Acme Corp", email: null } },
    ]);
    expect(await service.syncInvoices("co")).toEqual({ synced: 1, failed: 0, errors: [] });

    const [query, customer, invoice] = provider.calls;
    expect(query.url.searchParams.get("query")).toBe("select Id from Customer where DisplayName = 'Acme Corp'");
    expect(documentedViolations(quickbooks.createNameListEntity, customer.body)).toEqual([]);
    expect(documentedViolations(quickbooks.createInvoice, invoice.body)).toEqual([]);
    expect(invoice.body.CurrencyRef).toEqual({ value: "USD" });
  });

  it("creates a vendor and a bill with every documented required field", async () => {
    prisma.subcontractorCost.findMany.mockResolvedValue([
      { id: "b1", description: "Drywall", amount: "4200.00", dueDate: null, subcontractor: { name: "Drywall Co", email: null }, project: { currency: null } },
    ]);
    expect(await service.syncBills("co")).toEqual({ synced: 1, failed: 0, errors: [] });

    const [, vendor, bill] = provider.calls;
    expect(documentedViolations(quickbooks.createNameListEntity, vendor.body)).toEqual([]);
    expect(documentedViolations(quickbooks.createBill, bill.body)).toEqual([]);
    expect(bill.body.CurrencyRef).toEqual({ value: "USD" });
  });
});
