import { JwtService } from "@nestjs/jwt";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { MsProjectService } from "./ms-project.service";

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400) {
  return { ok, status, json: async () => body } as unknown as Response;
}

const ENV_URL = "https://org12345.crm4.dynamics.com";

describe("MsProjectService", () => {
  let service: MsProjectService;
  let prisma: {
    msProjectConnection: { findUnique: jest.Mock; upsert: jest.Mock; update: jest.Mock; deleteMany: jest.Mock };
    project: { findFirst: jest.Mock; update: jest.Mock };
    task: { findMany: jest.Mock; update: jest.Mock };
  };
  let config: { get: jest.Mock; getOrThrow: jest.Mock };
  let jwt: JwtService;
  let fetchMock: jest.Mock;

  const CONFIG_VALUES: Record<string, string> = {
    MS_PROJECT_CLIENT_ID: "ms-client-id",
    MS_PROJECT_CLIENT_SECRET: "ms-secret",
    API_ORIGIN: "http://localhost:4000/api",
  };

  beforeEach(() => {
    prisma = {
      msProjectConnection: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn(), deleteMany: jest.fn() },
      project: { findFirst: jest.fn(), update: jest.fn() },
      task: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
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

    service = new MsProjectService(prisma as never, config as never, jwt);
  });

  describe("getAuthorizeUrl", () => {
    it("throws when MS_PROJECT_CLIENT_ID isn't configured", () => {
      config.get.mockImplementation(() => undefined);
      expect(() => service.getAuthorizeUrl("company-a", ENV_URL)).toThrow(BadRequestException);
    });

    it("builds an authorize URL scoped to the given environment, carrying a signed state", () => {
      const url = service.getAuthorizeUrl("company-a", ENV_URL);
      const parsed = new URL(url);

      expect(parsed.origin + parsed.pathname).toBe("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
      expect(parsed.searchParams.get("client_id")).toBe("ms-client-id");
      expect(parsed.searchParams.get("scope")).toBe(`${ENV_URL}/.default offline_access`);
      expect(parsed.searchParams.get("redirect_uri")).toBe("http://localhost:4000/api/auth/ms-project/callback");

      const decoded = jwt.verify(parsed.searchParams.get("state")!) as { companyId: string; environmentUrl: string };
      expect(decoded).toEqual({ companyId: "company-a", environmentUrl: ENV_URL, iat: expect.any(Number), exp: expect.any(Number) });
    });

    it("strips a trailing slash from the environment URL before encoding it", () => {
      const url = service.getAuthorizeUrl("company-a", `${ENV_URL}/`);
      const decoded = jwt.verify(new URL(url).searchParams.get("state")!) as { environmentUrl: string };
      expect(decoded.environmentUrl).toBe(ENV_URL);
    });
  });

  describe("handleCallback", () => {
    it("rejects a tampered or expired state", async () => {
      await expect(service.handleCallback("code", "not-a-real-token")).rejects.toThrow(BadRequestException);
    });

    it("exchanges the code and stores the connection with the environmentUrl from the state", async () => {
      const state = jwt.sign({ companyId: "company-a", environmentUrl: ENV_URL });
      fetchMock.mockResolvedValueOnce(jsonResponse({ access_token: "at", refresh_token: "rt", expires_in: 3600 }));

      const result = await service.handleCallback("auth-code", state);

      expect(result).toEqual({ companyId: "company-a" });
      expect(prisma.msProjectConnection.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId: "company-a" },
          create: expect.objectContaining({ accessToken: "at", environmentUrl: ENV_URL }),
        }),
      );
    });

    it("throws when Microsoft rejects the authorization code", async () => {
      const state = jwt.sign({ companyId: "company-a", environmentUrl: ENV_URL });
      fetchMock.mockResolvedValueOnce(jsonResponse({}, false, 400));

      await expect(service.handleCallback("bad-code", state)).rejects.toThrow(BadRequestException);
    });
  });

  describe("getStatus / disconnect", () => {
    it("reports not connected when no row exists", async () => {
      prisma.msProjectConnection.findUnique.mockResolvedValue(null);
      await expect(service.getStatus("company-a")).resolves.toEqual({ connected: false });
    });

    it("reports the connection's environment when connected", async () => {
      prisma.msProjectConnection.findUnique.mockResolvedValue({ environmentUrl: ENV_URL, connectedAt: new Date("2026-01-01") });
      const status = await service.getStatus("company-a");
      expect(status).toEqual({ connected: true, environmentUrl: ENV_URL, connectedAt: new Date("2026-01-01") });
    });

    it("deletes the connection row", async () => {
      await service.disconnect("company-a");
      expect(prisma.msProjectConnection.deleteMany).toHaveBeenCalledWith({ where: { companyId: "company-a" } });
    });
  });

  describe("syncProject", () => {
    const activeConnection = {
      id: "conn-1",
      companyId: "company-a",
      accessToken: "at",
      refreshToken: "rt",
      tokenExpiresAt: new Date(Date.now() + 3600_000),
      environmentUrl: ENV_URL,
    };

    it("throws NotFoundException when nothing is connected", async () => {
      prisma.msProjectConnection.findUnique.mockResolvedValue(null);
      await expect(service.syncProject("company-a", "project-1")).rejects.toThrow(NotFoundException);
    });

    it("throws when the project doesn't belong to this company", async () => {
      prisma.msProjectConnection.findUnique.mockResolvedValue(activeConnection);
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(service.syncProject("company-a", "project-1")).rejects.toThrow(NotFoundException);
    });

    it("creates the remote project once, then pushes every unsynced task", async () => {
      prisma.msProjectConnection.findUnique.mockResolvedValue(activeConnection);
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", name: "Sample Reno", msProjectExternalId: null });
      prisma.task.findMany.mockResolvedValue([
        { id: "task-1", name: "Framing", startDate: new Date("2026-10-01"), dueDate: new Date("2026-10-10") },
        { id: "task-2", name: "Roofing", startDate: null, dueDate: null },
      ]);
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ msdyn_projectid: "ext-project-1" }))
        .mockResolvedValueOnce(jsonResponse({ msdyn_projecttaskid: "ext-task-1" }))
        .mockResolvedValueOnce(jsonResponse({ msdyn_projecttaskid: "ext-task-2" }));

      const result = await service.syncProject("company-a", "project-1");

      expect(result).toEqual({ synced: 2, failed: 0, errors: [] });
      expect(prisma.project.update).toHaveBeenCalledWith({ where: { id: "project-1" }, data: { msProjectExternalId: "ext-project-1" } });
      expect(prisma.task.update).toHaveBeenCalledWith({ where: { id: "task-1" }, data: { msProjectExternalId: "ext-task-1" } });
      const secondCallBody = JSON.parse(fetchMock.mock.calls[1][1].body);
      expect(secondCallBody["msdyn_ProjectId@odata.bind"]).toBe("/msdyn_projects(ext-project-1)");
      expect(secondCallBody.msdyn_start).toBe(new Date("2026-10-01").toISOString());
    });

    it("reuses the already-synced remote project instead of creating a duplicate", async () => {
      prisma.msProjectConnection.findUnique.mockResolvedValue(activeConnection);
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", name: "Sample Reno", msProjectExternalId: "ext-project-existing" });
      prisma.task.findMany.mockResolvedValue([{ id: "task-1", name: "Framing", startDate: null, dueDate: null }]);
      fetchMock.mockResolvedValueOnce(jsonResponse({ msdyn_projecttaskid: "ext-task-1" }));

      await service.syncProject("company-a", "project-1");

      expect(fetchMock).toHaveBeenCalledTimes(1); // only the task create, no project create
      expect(prisma.project.update).not.toHaveBeenCalled();
    });

    it("collects one task's failure without aborting the rest of the batch", async () => {
      prisma.msProjectConnection.findUnique.mockResolvedValue(activeConnection);
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", name: "Sample Reno", msProjectExternalId: "ext-project-1" });
      prisma.task.findMany.mockResolvedValue([
        { id: "task-1", name: "Broken Task", startDate: null, dueDate: null },
        { id: "task-2", name: "Roofing", startDate: null, dueDate: null },
      ]);
      fetchMock.mockResolvedValueOnce(jsonResponse({}, false, 500)).mockResolvedValueOnce(jsonResponse({ msdyn_projecttaskid: "ext-task-2" }));

      const result = await service.syncProject("company-a", "project-1");

      expect(result.synced).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors[0]).toContain("Broken Task");
    });

    it("refreshes an expired token before syncing", async () => {
      prisma.msProjectConnection.findUnique.mockResolvedValue({ ...activeConnection, tokenExpiresAt: new Date(Date.now() - 1000) });
      prisma.msProjectConnection.update.mockResolvedValue({ ...activeConnection, accessToken: "new-at" });
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", name: "Sample Reno", msProjectExternalId: "ext-project-1" });
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ access_token: "new-at", refresh_token: "new-rt", expires_in: 3600 }));

      const result = await service.syncProject("company-a", "project-1");

      expect(prisma.msProjectConnection.update).toHaveBeenCalled();
      expect(result).toEqual({ synced: 0, failed: 0, errors: [] });
    });
  });
});
