import { JwtService } from "@nestjs/jwt";
import { BadGatewayException, BadRequestException, NotFoundException } from "@nestjs/common";
import { AutodeskService, versionUrn } from "./autodesk.service";

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

    it("exchanges the code, fetches hubs, mints a viewer token, and stores the first hub's id and region", async () => {
      const state = jwt.sign({ companyId: "company-a" });
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ access_token: "at", refresh_token: "rt", expires_in: 3600 }))
        .mockResolvedValueOnce(jsonResponse({ data: [{ id: "b.hub-1", attributes: { region: "EMEA" } }, { id: "b.hub-2" }] }))
        .mockResolvedValueOnce(jsonResponse({ access_token: "viewer-at", refresh_token: "rt-2", expires_in: 3599 }));

      const result = await service.handleCallback("auth-code", state);

      expect(result).toEqual({ companyId: "company-a" });
      const viewerRefresh = new URLSearchParams(fetchMock.mock.calls[2][1].body);
      expect(viewerRefresh.get("refresh_token")).toBe("rt");
      expect(viewerRefresh.get("scope")).toBe("viewables:read");
      expect(prisma.autodeskConnection.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId: "company-a" },
          create: expect.objectContaining({ hubId: "b.hub-1", hubRegion: "EMEA", accessToken: "at", viewerAccessToken: "viewer-at", refreshToken: "rt-2" }),
        }),
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

  describe("token refresh", () => {
    const expired = { id: "c", companyId: "company-a", accessToken: "old", refreshToken: "rt-old", tokenExpiresAt: new Date(Date.now() - 1000), hubId: "b.hub", hubRegion: "US", viewerAccessToken: "old-viewer" };

    it("refreshes the server token with the full scope, then narrows a second refresh for the viewer, and keeps the last refresh token", async () => {
      prisma.autodeskConnection.findUnique.mockResolvedValue(expired);
      prisma.autodeskConnection.update.mockImplementation(async ({ data }: { data: object }) => ({ ...expired, ...data }));
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ access_token: "server-at", refresh_token: "rt-1", expires_in: 3600 }))
        .mockResolvedValueOnce(jsonResponse({ access_token: "viewer-at", refresh_token: "rt-2", expires_in: 3599 }));

      const token = await service.getViewerToken("company-a");

      const [first, second] = fetchMock.mock.calls.map((c) => new URLSearchParams(c[1].body));
      expect([first.get("refresh_token"), first.get("scope")]).toEqual(["rt-old", "data:read data:write account:read"]);
      expect([second.get("refresh_token"), second.get("scope")]).toEqual(["rt-1", "viewables:read"]);
      expect(prisma.autodeskConnection.update).toHaveBeenCalledWith({
        where: { id: "c" },
        data: expect.objectContaining({ accessToken: "server-at", viewerAccessToken: "viewer-at", refreshToken: "rt-2" }),
      });
      expect(token.accessToken).toBe("viewer-at");
      expect(token.expiresIn).toBeGreaterThan(3500);
    });

    it("refreshes a still-valid connection that predates the viewer so it gets a viewer token", async () => {
      prisma.autodeskConnection.findUnique.mockResolvedValue({ ...expired, tokenExpiresAt: new Date(Date.now() + 3_000_000), viewerAccessToken: null });
      prisma.autodeskConnection.update.mockImplementation(async ({ data }: { data: object }) => ({ ...expired, ...data }));
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ access_token: "server-at", refresh_token: "rt-1", expires_in: 3600 }))
        .mockResolvedValueOnce(jsonResponse({ access_token: "viewer-at", refresh_token: "rt-2", expires_in: 3600 }));

      await expect(service.getViewerToken("company-a")).resolves.toMatchObject({ accessToken: "viewer-at" });
    });

    it("asks for a reconnect when Autodesk refuses the refresh", async () => {
      prisma.autodeskConnection.findUnique.mockResolvedValue(expired);
      fetchMock.mockResolvedValueOnce(jsonResponse({ error: "invalid_grant" }, false, 400));
      await expect(service.getViewerToken("company-a")).rejects.toThrow(/reconnect/);
      expect(prisma.autodeskConnection.update).not.toHaveBeenCalled();
    });
  });

  describe("getViewerToken", () => {
    const fresh = { id: "c", companyId: "company-a", accessToken: "server-at", refreshToken: "rt", tokenExpiresAt: new Date(Date.now() + 1_800_000), hubId: "b.hub", viewerAccessToken: "viewer-at" };

    it.each([
      ["US", "streamingV2"],
      ["EMEA", "streamingV2_EU"],
      ["AUS", "streamingV2_AUS"],
      [null, "streamingV2"],
    ])("hub region %s streams from %s", async (hubRegion, api) => {
      prisma.autodeskConnection.findUnique.mockResolvedValue({ ...fresh, hubRegion });
      await expect(service.getViewerToken("company-a")).resolves.toEqual({ accessToken: "viewer-at", expiresIn: expect.any(Number), api });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("never hands out the server token", async () => {
      prisma.autodeskConnection.findUnique.mockResolvedValue({ ...fresh, hubRegion: "US" });
      const token = await service.getViewerToken("company-a");
      expect(token.accessToken).not.toBe("server-at");
    });
  });

  describe("setModel", () => {
    const URN = "dXJuOmFkc2sud2lwcHJvZDpmcy5maWxlOnZmLmFiYz92ZXJzaW9uPTM";

    it("pins the model and clears it again", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "p1" });
      await service.setModel("company-a", "p1", { urn: URN, name: "Tower A.rvt (v3)" });
      expect(prisma.project.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "p1" }, data: { autodeskModelUrn: URN, autodeskModelName: "Tower A.rvt (v3)" } }));
      await service.setModel("company-a", "p1", null);
      expect(prisma.project.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: { autodeskModelUrn: null, autodeskModelName: null } }));
    });

    it("rejects something that isn't a URN", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "p1" });
      await expect(service.setModel("company-a", "p1", { urn: "urn:adsk.wipprod:fs.file:vf.abc?version=3", name: "x" })).rejects.toThrow(BadRequestException);
      expect(prisma.project.update).not.toHaveBeenCalled();
    });

    it("refuses another company's project", async () => {
      prisma.project.findFirst.mockResolvedValue(null);
      await expect(service.setModel("company-a", "p1", { urn: URN, name: "x" })).rejects.toThrow(NotFoundException);
    });
  });

  describe("linkProject", () => {
    const ACC = "c8b0c73d-3ae9-4b1a-9c2d-1e2f3a4b5c6d";

    it("accepts the id with or without the b. prefix and keeps the model when the project stays the same", async () => {
      prisma.project.findFirst.mockResolvedValue({ autodeskProjectId: `b.${ACC}` });
      await service.linkProject("company-a", "p1", ` b.${ACC} `);
      expect(prisma.project.update).toHaveBeenCalledWith(expect.objectContaining({ data: { autodeskProjectId: `b.${ACC}` } }));
    });

    it("drops the pinned model when the ACC project changes", async () => {
      prisma.project.findFirst.mockResolvedValue({ autodeskProjectId: "b.00000000-0000-0000-0000-000000000000" });
      await service.linkProject("company-a", "p1", ACC);
      expect(prisma.project.update).toHaveBeenCalledWith(expect.objectContaining({ data: { autodeskProjectId: ACC, autodeskModelUrn: null, autodeskModelName: null } }));
    });

    it("rejects something that isn't a project id", async () => {
      await expect(service.linkProject("company-a", "p1", "https://acc.autodesk.com/docs/files/projects/x")).rejects.toThrow(BadRequestException);
      expect(prisma.project.update).not.toHaveBeenCalled();
    });
  });

  describe("browseModels errors", () => {
    beforeEach(() => {
      prisma.autodeskConnection.findUnique.mockResolvedValue({ id: "c", companyId: "company-a", accessToken: "at", refreshToken: "rt", tokenExpiresAt: new Date(Date.now() + 3600_000), hubId: "b.hub", viewerAccessToken: "v" });
      prisma.project.findFirst.mockResolvedValue({ autodeskProjectId: "c8b0c73d-3ae9-4b1a-9c2d-1e2f3a4b5c6d" });
    });

    it.each([
      [401, /reconnect/],
      [403, /ask an ACC project admin/],
      [404, /check the ACC project ID/],
    ])("turns Autodesk's %i into an actionable 400", async (status, message) => {
      fetchMock.mockResolvedValueOnce(jsonResponse({}, false, status));
      const err = await service.browseModels("company-a", "p1").catch((e: unknown) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as Error).message).toMatch(message);
    });

    it("reports anything else as a bad gateway, not a 500", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({}, false, 503));
      await expect(service.browseModels("company-a", "p1")).rejects.toThrow(BadGatewayException);
    });
  });

  describe("browseModels guards", () => {
    it("needs the project linked to an ACC project first", async () => {
      prisma.autodeskConnection.findUnique.mockResolvedValue({ id: "c", companyId: "company-a", accessToken: "at", refreshToken: "rt", tokenExpiresAt: new Date(Date.now() + 3600_000), hubId: "b.hub", viewerAccessToken: "v" });
      prisma.project.findFirst.mockResolvedValue({ autodeskProjectId: null });
      await expect(service.browseModels("company-a", "p1")).rejects.toThrow(/Link this project/);
    });
  });

  it("versionUrn is the unpadded URL-safe base64 of the version id", () => {
    const id = "urn:adsk.wipprod:fs.file:vf.abc?version=3";
    const urn = versionUrn(id);
    expect(urn).not.toMatch(/[+/=]/);
    expect(Buffer.from(urn, "base64url").toString()).toBe(id);
  });

  // syncPunchList's request/response behavior is pinned to the provider's published contract in
  // src/__provider-contracts__/documented-providers.contract.spec.ts; only the guards live here.
  describe("syncPunchList guards", () => {
    it("throws when the project doesn't belong to this company", async () => {
      prisma.autodeskConnection.findUnique.mockResolvedValue({ id: "c", companyId: "company-a", accessToken: "at", refreshToken: "rt", tokenExpiresAt: new Date(Date.now() + 3600_000), hubId: "b.hub", viewerAccessToken: "v" });
      prisma.project.findFirst.mockResolvedValue(null);
      await expect(service.syncPunchList("company-a", "project-1", "acc-project")).rejects.toThrow(NotFoundException);
    });

    it("reports a refused issue-types lookup as a 400 with a next step, not a 500", async () => {
      prisma.autodeskConnection.findUnique.mockResolvedValue({ id: "c", companyId: "company-a", accessToken: "at", refreshToken: "rt", tokenExpiresAt: new Date(Date.now() + 3600_000), hubId: "b.hub", viewerAccessToken: "v" });
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", autodeskProjectId: "acc-project" });
      prisma.punchListItem.findMany.mockResolvedValue([{ id: "pl1", title: "x", description: null, status: "open", dueDate: null }]);
      fetchMock.mockResolvedValueOnce(jsonResponse({}, false, 403));
      await expect(service.syncPunchList("company-a", "project-1", "acc-project")).rejects.toThrow(/ask an ACC project admin/);
    });

    it("throws NotFoundException when nothing is connected", async () => {
      prisma.autodeskConnection.findUnique.mockResolvedValue(null);
      await expect(service.syncPunchList("company-a", "project-1", "acc-project")).rejects.toThrow(NotFoundException);
    });
  });
});
