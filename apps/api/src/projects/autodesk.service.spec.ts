import { JwtService } from "@nestjs/jwt";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { AutodeskService } from "./autodesk.service";

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400) {
  return { ok, status, json: async () => body } as unknown as Response;
}

describe("AutodeskService", () => {
  let service: AutodeskService;
  let prisma: {
    autodeskConnection: { findUnique: jest.Mock; upsert: jest.Mock; update: jest.Mock; deleteMany: jest.Mock };
    project: { findFirst: jest.Mock; update: jest.Mock };
    punchListItem: { findMany: jest.Mock; update: jest.Mock };
  };
  let config: { get: jest.Mock; getOrThrow: jest.Mock };
  let jwt: JwtService;
  let fetchMock: jest.Mock;

  const CONFIG_VALUES: Record<string, string> = {
    AUTODESK_CLIENT_ID: "aps-client-id",
    AUTODESK_CLIENT_SECRET: "aps-secret",
    API_ORIGIN: "http://localhost:4000/api",
  };

  beforeEach(() => {
    prisma = {
      autodeskConnection: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn(), deleteMany: jest.fn() },
      project: { findFirst: jest.fn(), update: jest.fn() },
      punchListItem: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
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

    service = new AutodeskService(prisma as never, config as never, jwt);
  });

  describe("getAuthorizeUrl", () => {
    it("throws when AUTODESK_CLIENT_ID isn't configured", () => {
      config.get.mockImplementation(() => undefined);
      expect(() => service.getAuthorizeUrl("company-a")).toThrow(BadRequestException);
    });

    it("builds an authorize URL carrying a signed state", () => {
      const url = service.getAuthorizeUrl("company-a");
      const parsed = new URL(url);

      expect(parsed.origin + parsed.pathname).toBe("https://developer.api.autodesk.com/authentication/v2/authorize");
      expect(parsed.searchParams.get("client_id")).toBe("aps-client-id");
      expect(parsed.searchParams.get("redirect_uri")).toBe("http://localhost:4000/api/auth/autodesk/callback");

      const decoded = jwt.verify(parsed.searchParams.get("state")!) as { companyId: string };
      expect(decoded.companyId).toBe("company-a");
    });
  });

  describe("handleCallback", () => {
    it("rejects a tampered or expired state", async () => {
      await expect(service.handleCallback("code", "not-a-real-token")).rejects.toThrow(BadRequestException);
    });

    it("exchanges the code, fetches hubs, and stores the first hub's id", async () => {
      const state = jwt.sign({ companyId: "company-a" });
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ access_token: "at", refresh_token: "rt", expires_in: 3600 }))
        .mockResolvedValueOnce(jsonResponse({ data: [{ id: "b.hub-1" }, { id: "b.hub-2" }] }));

      const result = await service.handleCallback("auth-code", state);

      expect(result).toEqual({ companyId: "company-a" });
      expect(prisma.autodeskConnection.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { companyId: "company-a" }, create: expect.objectContaining({ hubId: "b.hub-1" }) }),
      );
    });

    it("throws when the account has no accessible hub", async () => {
      const state = jwt.sign({ companyId: "company-a" });
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ access_token: "at", refresh_token: "rt", expires_in: 3600 }))
        .mockResolvedValueOnce(jsonResponse({ data: [] }));

      await expect(service.handleCallback("auth-code", state)).rejects.toThrow(BadRequestException);
    });

    it("throws when Autodesk rejects the authorization code", async () => {
      const state = jwt.sign({ companyId: "company-a" });
      fetchMock.mockResolvedValueOnce(jsonResponse({}, false, 400));

      await expect(service.handleCallback("bad-code", state)).rejects.toThrow(BadRequestException);
    });
  });

  describe("getStatus / disconnect", () => {
    it("reports not connected when no row exists", async () => {
      prisma.autodeskConnection.findUnique.mockResolvedValue(null);
      await expect(service.getStatus("company-a")).resolves.toEqual({ connected: false });
    });

    it("reports the connection's hub when connected", async () => {
      prisma.autodeskConnection.findUnique.mockResolvedValue({ hubId: "b.hub-1", connectedAt: new Date("2026-01-01") });
      const status = await service.getStatus("company-a");
      expect(status).toEqual({ connected: true, hubId: "b.hub-1", connectedAt: new Date("2026-01-01") });
    });

    it("deletes the connection row", async () => {
      await service.disconnect("company-a");
      expect(prisma.autodeskConnection.deleteMany).toHaveBeenCalledWith({ where: { companyId: "company-a" } });
    });
  });

  // syncPunchList's request/response behavior is pinned to the provider's published contract in
  // src/__provider-contracts__/documented-providers.contract.spec.ts; only the guards live here.
  describe("syncPunchList guards", () => {
    it("throws when the project doesn't belong to this company", async () => {
      prisma.autodeskConnection.findUnique.mockResolvedValue({ id: "c", companyId: "company-a", accessToken: "at", refreshToken: "rt", tokenExpiresAt: new Date(Date.now() + 3600_000), hubId: "b.hub" });
      prisma.project.findFirst.mockResolvedValue(null);
      await expect(service.syncPunchList("company-a", "project-1", "acc-project")).rejects.toThrow(NotFoundException);
    });

    it("throws NotFoundException when nothing is connected", async () => {
      prisma.autodeskConnection.findUnique.mockResolvedValue(null);
      await expect(service.syncPunchList("company-a", "project-1", "acc-project")).rejects.toThrow(NotFoundException);
    });
  });
});
