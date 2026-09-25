import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { IntacctService } from "./intacct.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";
import { encrypted } from "../common/crypto/testing";

const COMPANY = "company-a";
const ACTOR = { userId: "u1", name: "Jane" };

function jsonRes(status: number, body: unknown) {
  return { ok: status < 400, status, json: async () => body } as unknown as Response;
}

describe("IntacctService", () => {
  let service: IntacctService;
  let prisma: {
    intacctConnection: { findUnique: jest.Mock; upsert: jest.Mock; update: jest.Mock; deleteMany: jest.Mock };
    project: { findFirst: jest.Mock; update: jest.Mock };
    client: { update: jest.Mock };
    changeOrder: { findMany: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
  };
  let audit: { record: jest.Mock };
  let jwt: { sign: jest.Mock; verify: jest.Mock };
  let env: Record<string, string>;
  let fetchMock: jest.Mock;

  const freshConnection = (over = {}) => ({ id: "conn-1", companyId: COMPANY, accessToken: "AT", refreshToken: "RT", tokenExpiresAt: new Date(Date.now() + 3_600_000), changeOrderItemId: "ITEM-1", ...over });

  beforeEach(() => {
    prisma = {
      intacctConnection: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn(), deleteMany: jest.fn() },
      project: { findFirst: jest.fn(), update: jest.fn() },
      client: { update: jest.fn() },
      changeOrder: { findMany: jest.fn(), update: jest.fn() },
      $transaction: jest.fn(async (ops: unknown[]) => ops),
    };
    audit = { record: jest.fn() };
    jwt = { sign: jest.fn().mockReturnValue("STATE"), verify: jest.fn().mockReturnValue({ companyId: COMPANY }) };
    env = { INTACCT_CLIENT_ID: "cid", INTACCT_CLIENT_SECRET: "secret" };
    const config = { get: (k: string) => env[k], getOrThrow: (k: string) => env[k] };
    fetchMock = jest.fn();
    global.fetch = fetchMock as never;
    service = new IntacctService(prisma as unknown as PrismaService, config as unknown as ConfigService, jwt as unknown as JwtService, audit as unknown as AuditService);
  });

  describe("OAuth", () => {
    it("refuses to build an authorize URL when the server has no client id", () => {
      delete env.INTACCT_CLIENT_ID;
      expect(() => service.getAuthorizeUrl(COMPANY)).toThrow(BadRequestException);
    });

    it("asks for offline_access so a refresh token comes back", () => {
      const url = new URL(service.getAuthorizeUrl(COMPANY));
      expect(url.origin + url.pathname).toBe("https://api.intacct.com/ia/api/v1/oauth2/authorize");
      expect(url.searchParams.get("scope")).toBe("offline_access");
      expect(url.searchParams.get("response_type")).toBe("code");
      expect(url.searchParams.get("state")).toBe("STATE");
    });

    it("exchanges the code and stores both tokens", async () => {
      fetchMock.mockResolvedValue(jsonRes(200, { access_token: "A", refresh_token: "R", expires_in: 43200 }));
      await service.handleCallback("CODE", "STATE");
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.intacct.com/ia/api/v1/oauth2/token");
      expect((init.body as URLSearchParams).get("grant_type")).toBe("authorization_code");
      expect((init.body as URLSearchParams).get("code")).toBe("CODE");
      expect(prisma.intacctConnection.upsert.mock.calls[0][0].create).toMatchObject({ companyId: COMPANY, accessToken: encrypted("A"), refreshToken: encrypted("R") });
    });

    it("rejects a callback without a refresh token, since the connection couldn't outlive 12 hours", async () => {
      fetchMock.mockResolvedValue(jsonRes(200, { access_token: "A", expires_in: 43200 }));
      await expect(service.handleCallback("CODE", "STATE")).rejects.toThrow(/refresh token/);
      expect(prisma.intacctConnection.upsert).not.toHaveBeenCalled();
    });

    it("rejects an expired state token", async () => {
      jwt.verify.mockImplementation(() => {
        throw new Error("expired");
      });
      await expect(service.handleCallback("CODE", "STATE")).rejects.toThrow(/expired/);
    });
  });

  describe("pushProjectContract()", () => {
    const project = { id: "12345678-aaaa", name: "Haus 1", clientId: "cl-1", intacctContractId: null };
    const input = { intacctProjectId: "PRJ-1", intacctCustomerId: "CUST-1" };

    it("404s without a connection", async () => {
      prisma.project.findFirst.mockResolvedValue(project);
      prisma.intacctConnection.findUnique.mockResolvedValue(null);
      await expect(service.pushProjectContract(COMPANY, ACTOR, "p1", input)).rejects.toThrow(NotFoundException);
    });

    it("refuses a second push for the same project", async () => {
      prisma.project.findFirst.mockResolvedValue({ ...project, intacctContractId: "5" });
      await expect(service.pushProjectContract(COMPANY, ACTOR, "p1", input)).rejects.toThrow(/already pushed/);
    });

    it("posts the contract with the required fields and remembers the returned id and both mappings", async () => {
      prisma.project.findFirst.mockResolvedValue(project);
      prisma.intacctConnection.findUnique.mockResolvedValue(freshConnection());
      fetchMock.mockResolvedValue(jsonRes(201, { "ia::result": { key: "5", id: "PC-12345678", href: "/x" } }));

      const result = await service.pushProjectContract(COMPANY, ACTOR, "p1", input);

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.intacct.com/ia/api/v1/objects/construction/project-contract");
      expect(init.headers.Authorization).toBe("Bearer AT");
      expect(JSON.parse(init.body)).toMatchObject({ name: "Haus 1", project: { id: "PRJ-1" }, customer: { id: "CUST-1" }, contractDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
      expect(result).toEqual({ contractId: "PC-12345678" });
      expect(prisma.project.update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { intacctProjectId: "PRJ-1", intacctContractId: "PC-12345678" } });
      expect(prisma.client.update).toHaveBeenCalledWith({ where: { id: "cl-1" }, data: { intacctCustomerId: "CUST-1" } });
      expect(audit.record).toHaveBeenCalled();
    });

    it("refreshes an expired access token before calling the API", async () => {
      prisma.project.findFirst.mockResolvedValue(project);
      prisma.intacctConnection.findUnique.mockResolvedValue(freshConnection({ tokenExpiresAt: new Date(Date.now() - 1000) }));
      prisma.intacctConnection.update.mockResolvedValue(freshConnection({ accessToken: "NEW" }));
      fetchMock
        .mockResolvedValueOnce(jsonRes(200, { access_token: "NEW", refresh_token: "R2", expires_in: 43200 }))
        .mockResolvedValueOnce(jsonRes(201, { "ia::result": { id: "PC-1" } }));

      await service.pushProjectContract(COMPANY, ACTOR, "p1", input);

      expect((fetchMock.mock.calls[0][1].body as URLSearchParams).get("grant_type")).toBe("refresh_token");
      expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe("Bearer NEW");
    });
  });

  describe("pushChangeOrders()", () => {
    const project = { id: "abcdef1234", intacctProjectId: "PRJ-1" };
    const order = (n: number) => ({ id: `co-${n}`, number: n, title: "Extra footing", description: "Deeper", grandTotal: { toString: () => "1234.50" }, decisionAt: new Date("2026-09-15"), createdAt: new Date("2026-09-01") });

    it("needs the contract pushed first", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "p1", intacctProjectId: null });
      await expect(service.pushChangeOrders(COMPANY, ACTOR, "p1")).rejects.toThrow(/contract first/);
    });

    it("needs the Intacct item id configured", async () => {
      prisma.project.findFirst.mockResolvedValue(project);
      prisma.intacctConnection.findUnique.mockResolvedValue(freshConnection({ changeOrderItemId: null }));
      await expect(service.pushChangeOrders(COMPANY, ACTOR, "p1")).rejects.toThrow(/item ID/);
    });

    it("only asks for approved, not-yet-pushed orders and posts each as a draft with the amount in the description", async () => {
      prisma.project.findFirst.mockResolvedValue(project);
      prisma.intacctConnection.findUnique.mockResolvedValue(freshConnection());
      prisma.changeOrder.findMany.mockResolvedValue([order(1)]);
      fetchMock.mockResolvedValue(jsonRes(201, { "ia::result": { key: "9", id: "CAN-abcdef-CO1" } }));

      const summary = await service.pushChangeOrders(COMPANY, ACTOR, "p1");

      expect(prisma.changeOrder.findMany.mock.calls[0][0].where).toMatchObject({ status: "approved", intacctChangeOrderId: null, estimate: { projectId: "p1" } });
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body).toMatchObject({ id: "CAN-abcdef-CO1", project: { id: "PRJ-1" }, item: { id: "ITEM-1" }, state: "draft", projectChangeOrderDate: "2026-09-15", priceEffectiveDate: "2026-09-15" });
      expect(body.description).toContain("Cantero total: 1234.50");
      expect(prisma.changeOrder.update).toHaveBeenCalledWith({ where: { id: "co-1" }, data: { intacctChangeOrderId: "CAN-abcdef-CO1" } });
      expect(summary).toEqual({ pushed: 1, failed: 0, errors: [] });
    });

    it("keeps going after one order fails and reports Intacct's own error message", async () => {
      prisma.project.findFirst.mockResolvedValue(project);
      prisma.intacctConnection.findUnique.mockResolvedValue(freshConnection());
      prisma.changeOrder.findMany.mockResolvedValue([order(1), order(2)]);
      fetchMock
        .mockResolvedValueOnce(jsonRes(400, { "ia::result": { error: { message: "Item ITEM-1 not found" } } }))
        .mockResolvedValueOnce(jsonRes(201, { "ia::result": { id: "X" } }));

      const summary = await service.pushChangeOrders(COMPANY, ACTOR, "p1");

      expect(summary.pushed).toBe(1);
      expect(summary.failed).toBe(1);
      expect(summary.errors[0]).toMatch(/CO-1.*Item ITEM-1 not found/);
      expect(prisma.changeOrder.update).toHaveBeenCalledTimes(1);
    });
  });
});
