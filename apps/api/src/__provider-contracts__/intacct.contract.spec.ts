import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { IntacctService } from "../intacct/intacct.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";
import { fakeProvider, openApiViolations, type OpenApiDoc } from "./harness";
import spec from "./specs/intacct-construction.subset.json";

const doc = spec as unknown as OpenApiDoc;
const BASE = "https://api.intacct.com/ia/api/v1";

describe("Sage Intacct Construction — against the published OpenAPI schema", () => {
  let provider: ReturnType<typeof fakeProvider>;
  let service: IntacctService;
  const prisma = {
    intacctConnection: {
      findUnique: jest.fn().mockResolvedValue({ id: "c", companyId: "co", accessToken: "AT", refreshToken: "RT", tokenExpiresAt: new Date(Date.now() + 3_600_000), changeOrderItemId: "ITEM-1" }),
    },
    project: { findFirst: jest.fn(), update: jest.fn() },
    client: { update: jest.fn() },
    changeOrder: { findMany: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(async (ops: unknown[]) => ops),
  };

  beforeEach(() => {
    provider = fakeProvider([
      // 201 bodies are the spec's own documented examples.
      { method: "POST", url: /\/objects\/construction\/project-contract$/, respond: () => ({ status: 201, body: { "ia::result": { key: "5", id: "PC-12345678", href: "/objects/construction/project-contract/5" }, "ia::meta": { totalCount: 1, totalSuccess: 1, totalError: 0 } } }) },
      { method: "POST", url: /\/objects\/construction\/project-change-order$/, respond: () => ({ status: 201, body: { "ia::result": { key: "6", id: "PCO-BTI-6", href: "/objects/construction/project-change-order/6" }, "ia::meta": { totalCount: 1, totalSuccess: 1, totalError: 0 } } }) },
    ]);
    const config = { get: (k: string) => ({ INTACCT_CLIENT_ID: "cid", INTACCT_CLIENT_SECRET: "s" })[k], getOrThrow: () => "x" };
    service = new IntacctService(prisma as unknown as PrismaService, config as unknown as ConfigService, new JwtService({ secret: "s" }), { record: jest.fn() } as unknown as AuditService);
  });
  afterEach(() => provider.restore());

  it("the validator itself catches a missing required field, an invented field and a readOnly field", () => {
    expect(openApiViolations(doc, "POST", "/objects/construction/project-contract", { name: "x", project: { id: "P" }, contractDate: "2026-09-21", colour: "red", key: "1" })).toEqual(
      expect.arrayContaining([expect.stringContaining("customer"), "body.colour is not a property the provider defines", "body.key is readOnly in the provider's schema"]),
    );
  });

  it("creates a project contract with a body the schema accepts", async () => {
    prisma.project.findFirst.mockResolvedValue({ id: "12345678-aaaa", name: "Haus 1", clientId: "cl", intacctContractId: null });
    await service.pushProjectContract("co", { name: "J" }, "p1", { intacctProjectId: "PRJ-1", intacctCustomerId: "CUST-1" });

    const [call] = provider.calls;
    expect(call.url.href).toBe(`${BASE}/objects/construction/project-contract`);
    expect(call.headers.authorization).toBe("Bearer AT");
    expect(openApiViolations(doc, "POST", "/objects/construction/project-contract", call.body)).toEqual([]);
  });

  it("creates project change orders with a body the schema accepts", async () => {
    prisma.project.findFirst.mockResolvedValue({ id: "abcdef1234", intacctProjectId: "PRJ-1" });
    prisma.changeOrder.findMany.mockResolvedValue([{ id: "co1", number: 1, title: "Footing", description: null, grandTotal: { toString: () => "100" }, decisionAt: new Date("2026-09-15"), createdAt: new Date() }]);
    const summary = await service.pushChangeOrders("co", { name: "J" }, "p1");

    expect(summary).toEqual({ pushed: 1, failed: 0, errors: [] });
    expect(openApiViolations(doc, "POST", "/objects/construction/project-change-order", provider.calls[0].body)).toEqual([]);
  });
});
