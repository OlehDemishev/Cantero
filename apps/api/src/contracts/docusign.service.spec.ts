import { JwtService } from "@nestjs/jwt";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { DocusignService } from "./docusign.service";
import { encrypted } from "../common/crypto/testing";

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400) {
  return { ok, status, json: async () => body, arrayBuffer: async () => Buffer.from("pdf-bytes") } as unknown as Response;
}

describe("DocusignService", () => {
  let service: DocusignService;
  let prisma: {
    docusignConnection: { findUnique: jest.Mock; upsert: jest.Mock; update: jest.Mock; deleteMany: jest.Mock };
  };
  let config: { get: jest.Mock; getOrThrow: jest.Mock };
  let jwt: JwtService;
  let fetchMock: jest.Mock;

  const CONFIG_VALUES: Record<string, string> = {
    DOCUSIGN_CLIENT_ID: "ds-client-id",
    DOCUSIGN_CLIENT_SECRET: "ds-secret",
    API_ORIGIN: "http://localhost:4000/api",
  };

  beforeEach(() => {
    prisma = {
      docusignConnection: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn(), deleteMany: jest.fn() },
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

    service = new DocusignService(prisma as never, config as never, jwt);
  });

  describe("getAuthorizeUrl", () => {
    it("throws when DOCUSIGN_CLIENT_ID isn't configured", () => {
      config.get.mockImplementation(() => undefined);
      expect(() => service.getAuthorizeUrl("company-a")).toThrow(BadRequestException);
    });

    it("builds an authorize URL on the demo host by default, carrying a signed state", () => {
      const url = service.getAuthorizeUrl("company-a");
      const parsed = new URL(url);

      expect(parsed.origin + parsed.pathname).toBe("https://account-d.docusign.com/oauth/auth");
      expect(parsed.searchParams.get("client_id")).toBe("ds-client-id");
      expect(parsed.searchParams.get("scope")).toBe("signature");
      expect(parsed.searchParams.get("redirect_uri")).toBe("http://localhost:4000/api/auth/docusign/callback");

      const decoded = jwt.verify(parsed.searchParams.get("state")!) as { companyId: string };
      expect(decoded.companyId).toBe("company-a");
    });

    it("uses DOCUSIGN_OAUTH_BASE_URL when set, so a real deployment can point at production", () => {
      config.get.mockImplementation((key: string) => (key === "DOCUSIGN_OAUTH_BASE_URL" ? "https://account.docusign.com" : CONFIG_VALUES[key]));
      const url = service.getAuthorizeUrl("company-a");
      expect(new URL(url).origin).toBe("https://account.docusign.com");
    });
  });

  describe("handleCallback", () => {
    it("rejects a tampered or expired state", async () => {
      await expect(service.handleCallback("code", "not-a-real-token")).rejects.toThrow(BadRequestException);
    });

    it("exchanges the code, fetches userinfo, and stores the default account's id and API base URL", async () => {
      const state = jwt.sign({ companyId: "company-a" });
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ access_token: "at", refresh_token: "rt", expires_in: 3600 }))
        .mockResolvedValueOnce(
          jsonResponse({
            accounts: [
              { account_id: "acct-1", is_default: false, base_uri: "https://na2.docusign.net" },
              { account_id: "acct-2", is_default: true, base_uri: "https://na3.docusign.net" },
            ],
          }),
        );

      const result = await service.handleCallback("auth-code", state);

      expect(result).toEqual({ companyId: "company-a" });
      expect(prisma.docusignConnection.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId: "company-a" },
          create: expect.objectContaining({ accountId: "acct-2", apiBaseUrl: "https://na3.docusign.net", accessToken: encrypted("at") }),
        }),
      );
    });

    it("throws when DocuSign rejects the authorization code", async () => {
      const state = jwt.sign({ companyId: "company-a" });
      fetchMock.mockResolvedValueOnce(jsonResponse({}, false, 400));

      await expect(service.handleCallback("bad-code", state)).rejects.toThrow(BadRequestException);
    });
  });

  describe("getStatus / disconnect", () => {
    it("reports not connected when no row exists", async () => {
      prisma.docusignConnection.findUnique.mockResolvedValue(null);
      await expect(service.getStatus("company-a")).resolves.toEqual({ connected: false });
    });

    it("reports the connection's account when connected", async () => {
      prisma.docusignConnection.findUnique.mockResolvedValue({ accountId: "acct-1", connectedAt: new Date("2026-01-01") });
      const status = await service.getStatus("company-a");
      expect(status).toEqual({ connected: true, accountId: "acct-1", connectedAt: new Date("2026-01-01") });
    });

    it("deletes the connection row", async () => {
      await service.disconnect("company-a");
      expect(prisma.docusignConnection.deleteMany).toHaveBeenCalledWith({ where: { companyId: "company-a" } });
    });
  });

  describe("getConnectionOrThrow", () => {
    it("throws NotFoundException when nothing is connected", async () => {
      prisma.docusignConnection.findUnique.mockResolvedValue(null);
      await expect(service.getConnectionOrThrow("company-a")).rejects.toThrow(NotFoundException);
    });

    it("refreshes an expired token before returning the connection", async () => {
      const stale = {
        id: "conn-1",
        companyId: "company-a",
        accessToken: "old-at",
        refreshToken: "old-rt",
        tokenExpiresAt: new Date(Date.now() - 1000),
        accountId: "acct-1",
        apiBaseUrl: "https://na3.docusign.net",
      };
      prisma.docusignConnection.findUnique.mockResolvedValue(stale);
      prisma.docusignConnection.update.mockResolvedValue({ ...stale, accessToken: "new-at" });
      fetchMock.mockResolvedValueOnce(jsonResponse({ access_token: "new-at", refresh_token: "new-rt", expires_in: 3600 }));

      const result = await service.getConnectionOrThrow("company-a");

      expect(prisma.docusignConnection.update).toHaveBeenCalled();
      expect(result.accessToken).toBe("new-at");
    });

    it("returns the connection unchanged when the token is still fresh", async () => {
      const fresh = {
        id: "conn-1",
        companyId: "company-a",
        accessToken: "at",
        refreshToken: "rt",
        tokenExpiresAt: new Date(Date.now() + 3600_000),
        accountId: "acct-1",
        apiBaseUrl: "https://na3.docusign.net",
      };
      prisma.docusignConnection.findUnique.mockResolvedValue(fresh);

      const result = await service.getConnectionOrThrow("company-a");

      expect(fetchMock).not.toHaveBeenCalled();
      expect(result).toEqual(fresh);
    });
  });

  describe("createEnvelope / getEnvelopeStatus / downloadCombinedDocument", () => {
    const connection = {
      id: "conn-1",
      companyId: "company-a",
      accessToken: "at",
      refreshToken: "rt",
      tokenExpiresAt: new Date(Date.now() + 3600_000),
      accountId: "acct-1",
      apiBaseUrl: "https://na3.docusign.net",
    };

    it("creates an envelope with a single signer and an anchor-string Sign Here tab", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ envelopeId: "env-1" }));

      const result = await service.createEnvelope(connection, {
        pdfBase64: "base64pdf",
        documentName: "MSA.pdf",
        emailSubject: "Please sign: MSA",
        signerEmail: "client@example.com",
        signerName: "Jane Client",
      });

      expect(result).toEqual({ envelopeId: "env-1" });
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe("https://na3.docusign.net/restapi/v2.1/accounts/acct-1/envelopes");
      const body = JSON.parse(options.body);
      expect(body.recipients.signers[0].tabs.signHereTabs[0].anchorString).toBe("/sig1/");
      expect(body.status).toBe("sent");
    });

    it("reports the envelope's current status", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ status: "completed", completedDateTime: "2026-09-16T10:00:00Z" }));

      const result = await service.getEnvelopeStatus(connection, "env-1");

      expect(result).toEqual({ status: "completed", completedAt: "2026-09-16T10:00:00Z" });
    });

    it("downloads the combined signed document as a Buffer", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({}));

      const result = await service.downloadCombinedDocument(connection, "env-1");

      expect(Buffer.isBuffer(result)).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith(
        "https://na3.docusign.net/restapi/v2.1/accounts/acct-1/envelopes/env-1/documents/combined",
        expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer at" }) }),
      );
    });
  });
});
