import { BadRequestException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { JwtService } from "@nestjs/jwt";

/**
 * The OAuth2 authorization-code plumbing shared by every connector (QuickBooks, Xero, DocuSign,
 * MS Project, Autodesk, Sage Intacct): the signed `state`, the callback URL, the token endpoint
 * call, and keeping a stored access token fresh. What differs per provider — scopes, which
 * account/hub/tenant to pick, what else to store — stays in each connector.
 */

const FETCH_TIMEOUT_MS = 10_000;
const STATE_TTL = "10m";
/** Refresh this long before the stored expiry, so a token never expires mid-request. */
const EXPIRY_MARGIN_MS = 60_000;

export interface OAuthTokens {
  access_token: string;
  /** Absent when the provider keeps the old refresh token valid (Intacct may do this). */
  refresh_token?: string;
  expires_in: number;
}

export interface TokenEndpoint {
  /** Shown to the user, e.g. "DocuSign", "Sage Intacct". */
  provider: string;
  url: string;
  clientId: string;
  clientSecret: string;
  /** How the client authenticates (RFC 6749 §2.3.1): an HTTP Basic header, or client_id and
   * client_secret in the form body. Each provider documents one. */
  clientAuth: "basic" | "body";
}

/** The provider answered the token request with an error (as opposed to the network failing). */
export class OAuthTokenError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
  ) {
    super(`Token endpoint refused the request (${status}${code ? ` ${code}` : ""})`);
  }
}

export function signState(jwt: JwtService, payload: Record<string, unknown>): string {
  return jwt.sign(payload, { expiresIn: STATE_TTL });
}

export function verifyState<T extends { companyId: string }>(jwt: JwtService, state: string): T {
  try {
    return jwt.verify<T>(state);
  } catch {
    throw new BadRequestException("This connection link has expired — try connecting again");
  }
}

export function apiOrigin(config: ConfigService): string {
  return config.get<string>("API_ORIGIN") ?? "http://localhost:4000/api";
}

/** Where the provider sends the browser back to, e.g. `…/api/auth/docusign/callback`. */
export function callbackUrl(config: ConfigService, slug: string): string {
  return `${apiOrigin(config)}/auth/${slug}/callback`;
}

export function tokenExpiry(tokens: OAuthTokens): Date {
  return new Date(Date.now() + tokens.expires_in * 1000);
}

/** One POST to a token endpoint (authorization_code or refresh_token grant). */
export async function requestToken(endpoint: TokenEndpoint, params: Record<string, string>): Promise<OAuthTokens> {
  const body = new URLSearchParams(params);
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" };
  if (endpoint.clientAuth === "basic") {
    headers.Authorization = `Basic ${Buffer.from(`${endpoint.clientId}:${endpoint.clientSecret}`).toString("base64")}`;
  } else {
    body.set("client_id", endpoint.clientId);
    body.set("client_secret", endpoint.clientSecret);
  }
  const res = await fetch(endpoint.url, { method: "POST", headers, body, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) {
    let code: string | undefined;
    try {
      code = (await res.json())?.error;
    } catch {
      // non-JSON error body
    }
    throw new OAuthTokenError(res.status, typeof code === "string" ? code : undefined);
  }
  return (await res.json()) as OAuthTokens;
}

/** The authorization_code exchange, with the provider's refusal turned into a 400 the callback
 * redirect can show. A connection without a refresh token would silently die within the hour, so
 * that's refused here too. */
export async function exchangeCode(endpoint: TokenEndpoint, params: Record<string, string>): Promise<OAuthTokens & { refresh_token: string }> {
  let tokens: OAuthTokens;
  try {
    tokens = await requestToken(endpoint, { grant_type: "authorization_code", ...params });
  } catch (err) {
    if (err instanceof OAuthTokenError) throw new BadRequestException(`${endpoint.provider} rejected the authorization code`);
    throw err;
  }
  if (!tokens.refresh_token) throw new BadRequestException(`${endpoint.provider} didn't return a refresh token — the connection can't stay authorized`);
  return { ...tokens, refresh_token: tokens.refresh_token };
}

export interface StoredTokens {
  id: string;
  refreshToken: string;
  tokenExpiresAt: Date;
}

export function expiresSoon(connection: StoredTokens): boolean {
  return connection.tokenExpiresAt.getTime() - Date.now() <= EXPIRY_MARGIN_MS;
}

const inFlight = new Map<string, Promise<unknown>>();

/**
 * Returns `connection` as is while its access token is good, otherwise runs `refresh` (token call
 * plus saving the result) and returns the saved row.
 *
 * Most providers issue single-use refresh tokens (Xero, Autodesk, Microsoft rotate on every use),
 * so two refreshes racing with the same token lose one of them — and the loser used to tell the
 * user to reconnect. Here, concurrent refreshes of one connection in this process share a single
 * call; and when the provider refuses a refresh, the row is re-read first: if another server
 * instance already refreshed it, its new tokens are used instead of failing.
 */
export function refreshIfExpiring<C extends StoredTokens>(
  connection: C,
  options: {
    /** Distinguishes connection tables in the in-flight map. */
    kind: string;
    refresh: (connection: C) => Promise<C>;
    reload: () => Promise<C | null>;
    reconnectMessage: string;
    /** Refresh even though the expiry is far off (e.g. a token type the row doesn't have yet). */
    force?: boolean;
  },
): Promise<C> {
  if (!options.force && !expiresSoon(connection)) return Promise.resolve(connection);

  const key = `${options.kind}:${connection.id}`;
  const pending = inFlight.get(key) as Promise<C> | undefined;
  if (pending) return pending;

  const run = (async () => {
    try {
      return await options.refresh(connection);
    } catch (err) {
      if (!(err instanceof OAuthTokenError)) throw err;
      const current = await options.reload();
      if (current && current.refreshToken !== connection.refreshToken && !expiresSoon(current)) return current;
      throw new BadRequestException(options.reconnectMessage);
    }
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, run);
  return run;
}
