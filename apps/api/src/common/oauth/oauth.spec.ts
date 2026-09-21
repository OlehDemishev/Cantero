import { BadRequestException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { OAuthTokenError, callbackUrl, exchangeCode, refreshIfExpiring, requestToken, signState, verifyState, type StoredTokens, type TokenEndpoint } from "./oauth";

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as unknown as Response;
}

const endpoint = (clientAuth: TokenEndpoint["clientAuth"]): TokenEndpoint => ({ provider: "Acme", url: "https://auth.acme.test/token", clientId: "id", clientSecret: "s3cret", clientAuth });

describe("oauth helpers", () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  describe("state", () => {
    const jwt = new JwtService({ secret: "s" });

    it("round-trips the payload", () => {
      expect(verifyState(jwt, signState(jwt, { companyId: "c1", provider: "xero" }))).toMatchObject({ companyId: "c1", provider: "xero" });
    });

    it("turns a forged or expired state into a 400 asking to connect again", () => {
      expect(() => verifyState(jwt, "forged")).toThrow(/expired — try connecting again/);
      expect(() => verifyState(jwt, new JwtService({ secret: "other" }).sign({ companyId: "c1" }))).toThrow(BadRequestException);
    });
  });

  it("builds the callback URL from API_ORIGIN", () => {
    expect(callbackUrl({ get: () => "https://api.cantero.app/api" } as never, "docusign")).toBe("https://api.cantero.app/api/auth/docusign/callback");
    expect(callbackUrl({ get: () => undefined } as never, "intacct")).toBe("http://localhost:4000/api/auth/intacct/callback");
  });

  describe("requestToken", () => {
    it("authenticates with a Basic header and keeps the secret out of the body", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ access_token: "a", refresh_token: "r", expires_in: 60 }));
      await requestToken(endpoint("basic"), { grant_type: "refresh_token", refresh_token: "r0" });
      const [, init] = fetchMock.mock.calls[0];
      expect(init.headers.Authorization).toBe(`Basic ${Buffer.from("id:s3cret").toString("base64")}`);
      expect(Object.fromEntries(init.body)).toEqual({ grant_type: "refresh_token", refresh_token: "r0" });
    });

    it("puts the client credentials in the body for body auth, with no Authorization header", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ access_token: "a", expires_in: 60 }));
      await requestToken(endpoint("body"), { grant_type: "refresh_token", refresh_token: "r0" });
      const [, init] = fetchMock.mock.calls[0];
      expect(init.headers.Authorization).toBeUndefined();
      expect(Object.fromEntries(init.body)).toMatchObject({ client_id: "id", client_secret: "s3cret" });
    });

    it("throws OAuthTokenError carrying the provider's error code", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ error: "invalid_grant" }, 400));
      const err = await requestToken(endpoint("basic"), {}).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(OAuthTokenError);
      expect(err).toMatchObject({ status: 400, code: "invalid_grant" });
    });
  });

  describe("exchangeCode", () => {
    it("sends the authorization_code grant", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ access_token: "a", refresh_token: "r", expires_in: 60 }));
      await exchangeCode(endpoint("basic"), { code: "c", redirect_uri: "https://x/cb" });
      expect(Object.fromEntries(fetchMock.mock.calls[0][1].body)).toEqual({ grant_type: "authorization_code", code: "c", redirect_uri: "https://x/cb" });
    });

    it("names the provider when it refuses the code", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ error: "invalid_grant" }, 400));
      await expect(exchangeCode(endpoint("basic"), { code: "c" })).rejects.toThrow("Acme rejected the authorization code");
    });

    it("refuses a connection that came back without a refresh token", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ access_token: "a", expires_in: 60 }));
      await expect(exchangeCode(endpoint("basic"), { code: "c" })).rejects.toThrow(/didn't return a refresh token/);
    });
  });

  describe("refreshIfExpiring", () => {
    const soon = () => new Date(Date.now() + 10_000);
    const later = () => new Date(Date.now() + 3_600_000);
    let seq = 0;
    const conn = (over: Partial<StoredTokens> = {}): StoredTokens => ({ id: `conn-${++seq}`, refreshToken: "rt-0", tokenExpiresAt: soon(), ...over });
    const opts = (c: StoredTokens, refresh: jest.Mock, reload: jest.Mock = jest.fn()) => ({ kind: "test", refresh, reload, reconnectMessage: "Reconnect Acme in Settings" });

    it("returns a connection with a good token untouched", async () => {
      const c = conn({ tokenExpiresAt: later() });
      const refresh = jest.fn();
      await expect(refreshIfExpiring(c, opts(c, refresh))).resolves.toBe(c);
      expect(refresh).not.toHaveBeenCalled();
    });

    it("refreshes a token about to expire, and when forced", async () => {
      const c = conn();
      const refresh = jest.fn(async (x: StoredTokens) => ({ ...x, refreshToken: "rt-1", tokenExpiresAt: later() }));
      await expect(refreshIfExpiring(c, opts(c, refresh))).resolves.toMatchObject({ refreshToken: "rt-1" });

      const good = conn({ tokenExpiresAt: later() });
      await refreshIfExpiring(good, { ...opts(good, refresh), force: true });
      expect(refresh).toHaveBeenCalledTimes(2);
    });

    it("shares one refresh between concurrent callers, so a single-use refresh token is spent once", async () => {
      const c = conn();
      let release!: () => void;
      const refresh = jest.fn(() => new Promise<StoredTokens>((resolve) => (release = () => resolve({ ...c, refreshToken: "rt-1", tokenExpiresAt: later() }))));
      const calls = [refreshIfExpiring(c, opts(c, refresh)), refreshIfExpiring(c, opts(c, refresh)), refreshIfExpiring({ ...c }, opts(c, refresh))];
      release();
      const results = await Promise.all(calls);
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(results.map((r) => r.refreshToken)).toEqual(["rt-1", "rt-1", "rt-1"]);

      // Once settled, the next expiry refreshes again rather than reusing the old result.
      const again = jest.fn(async (x: StoredTokens) => ({ ...x, refreshToken: "rt-2", tokenExpiresAt: later() }));
      await expect(refreshIfExpiring(c, opts(c, again))).resolves.toMatchObject({ refreshToken: "rt-2" });
    });

    it("uses the tokens another server instance already saved when the provider refuses the spent refresh token", async () => {
      const c = conn();
      const refresh = jest.fn().mockRejectedValue(new OAuthTokenError(400, "invalid_grant"));
      const reload = jest.fn().mockResolvedValue({ ...c, refreshToken: "rt-by-other-instance", tokenExpiresAt: later() });
      await expect(refreshIfExpiring(c, opts(c, refresh, reload))).resolves.toMatchObject({ refreshToken: "rt-by-other-instance" });
    });

    it("asks to reconnect when the provider refuses and nobody else refreshed", async () => {
      const c = conn();
      const refresh = jest.fn().mockRejectedValue(new OAuthTokenError(400, "invalid_grant"));
      const reload = jest.fn().mockResolvedValue(c);
      await expect(refreshIfExpiring(c, opts(c, refresh, reload))).rejects.toThrow("Reconnect Acme in Settings");
    });

    it("lets a network failure through as is — that isn't a reason to reconnect", async () => {
      const c = conn();
      const refresh = jest.fn().mockRejectedValue(new TypeError("fetch failed"));
      const reload = jest.fn();
      await expect(refreshIfExpiring(c, opts(c, refresh, reload))).rejects.toThrow("fetch failed");
      expect(reload).not.toHaveBeenCalled();
    });
  });
});
