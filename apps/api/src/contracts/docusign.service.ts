import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../common/prisma/prisma.service";

const FETCH_TIMEOUT_MS = 10_000;
const STATE_TTL = "10m";

/// DocuSign, like QuickBooks, splits its "demo" (sandbox/developer) environment and production
/// onto different account hosts (the eSignature API host itself is per-account — see
/// DocusignConnection.apiBaseUrl — but the OAuth/account-management host is this one).
/// Defaulting to demo keeps local dev/test working with no env var set, but a real deployment
/// MUST set DOCUSIGN_OAUTH_BASE_URL to "https://account.docusign.com" or every connection attempt
/// keeps hitting a demo account no real DocuSign customer has.
const DOCUSIGN_DEMO_OAUTH_BASE_URL = "https://account-d.docusign.com";

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

interface UserInfoResponse {
  accounts: { account_id: string; is_default: boolean; base_uri: string }[];
}

export interface DocusignConnection {
  id: string;
  companyId: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date;
  accountId: string;
  apiBaseUrl: string;
}

export interface EnvelopeResult {
  envelopeId: string;
}

export interface EnvelopeStatus {
  status: string;
  completedAt: string | null;
}

/**
 * Live OAuth2 (Authorization Code Grant) connection to DocuSign eSignature, plus the handful of
 * envelope calls ContractsService needs: create an envelope from a PDF + one signer, poll its
 * status, and download the completed, signed document once it's done. Structurally the same
 * OAuth2 shape as AccountingSyncService's QuickBooks/Xero connections (authorize → callback →
 * refresh), kept as its own service because DocuSign is a different capability (e-signature) with
 * its own account model, not because the OAuth mechanics differ.
 *
 * No DocuSign Connect webhook — configuring one requires pointing a webhook URL at this server
 * from inside a real DocuSign account's admin console, which isn't something this environment can
 * set up or verify. Envelope status is refreshed on demand instead (ContractsService.
 * refreshDocusignStatus, called by a "Refresh signing status" button) — a real deployment wanting
 * push updates would need to add Connect support later, once there's a live account to configure
 * and test it against.
 */
@Injectable()
export class DocusignService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  async getStatus(companyId: string) {
    const connection = await this.prisma.docusignConnection.findUnique({ where: { companyId } });
    if (!connection) return { connected: false as const };
    return { connected: true as const, accountId: connection.accountId, connectedAt: connection.connectedAt };
  }

  getAuthorizeUrl(companyId: string): string {
    const clientId = this.config.get<string>("DOCUSIGN_CLIENT_ID");
    if (!clientId) {
      throw new BadRequestException("DocuSign isn't configured on this server — set DOCUSIGN_CLIENT_ID/DOCUSIGN_CLIENT_SECRET");
    }

    const state = this.jwt.sign({ companyId }, { expiresIn: STATE_TTL });
    const params = new URLSearchParams({
      response_type: "code",
      scope: "signature",
      client_id: clientId,
      redirect_uri: this.callbackUrl(),
      state,
    });
    return `${this.oauthBaseUrl()}/oauth/auth?${params.toString()}`;
  }

  /** Verifies the signed state, exchanges the code, then calls GET /oauth/userinfo — unlike
   * QuickBooks/Xero's fixed API host, DocuSign returns the account's own eSignature API base URL
   * here, since different accounts live on different regional clusters (na1/na2/eu/au/...).
   * Returns the companyId so the controller can redirect appropriately even on later failures. */
  async handleCallback(code: string, state: string): Promise<{ companyId: string }> {
    let decoded: { companyId: string };
    try {
      decoded = this.jwt.verify(state);
    } catch {
      throw new BadRequestException("This connection link has expired — try connecting again");
    }
    const companyId = decoded.companyId;

    const tokens = await this.exchangeCode(code);
    const userInfo = await this.fetchUserInfo(tokens.access_token);
    const account = userInfo.accounts.find((a) => a.is_default) ?? userInfo.accounts[0];
    if (!account) throw new BadRequestException("DocuSign didn't return an account to connect");

    await this.prisma.docusignConnection.upsert({
      where: { companyId },
      create: {
        companyId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        accountId: account.account_id,
        apiBaseUrl: account.base_uri,
      },
      update: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        accountId: account.account_id,
        apiBaseUrl: account.base_uri,
      },
    });
    return { companyId };
  }

  async disconnect(companyId: string): Promise<void> {
    await this.prisma.docusignConnection.deleteMany({ where: { companyId } });
  }

  async getConnectionOrThrow(companyId: string): Promise<DocusignConnection> {
    const connection = await this.prisma.docusignConnection.findUnique({ where: { companyId } });
    if (!connection) throw new NotFoundException("No DocuSign account connected");
    return this.ensureFreshToken(connection);
  }

  /**
   * One document, one signer, sent immediately (status: "sent") — no template/routing/CC support.
   * The signer's Sign Here tab is placed via DocuSign's anchor-string mechanism rather than fixed
   * page/x/y coordinates: ContractsService embeds a literal `/sig1/` marker into the PDF text
   * specifically for the DocuSign copy (never the customer-facing downloadable PDF), so DocuSign
   * can locate it regardless of how long the contract body is. The marker stays visible in the
   * document — hiding it needs a more advanced tab configuration this integration doesn't attempt.
   */
  async createEnvelope(
    connection: DocusignConnection,
    input: { pdfBase64: string; documentName: string; emailSubject: string; signerEmail: string; signerName: string },
  ): Promise<EnvelopeResult> {
    const created = await this.request(connection, "POST", "/envelopes", {
      emailSubject: input.emailSubject,
      status: "sent",
      documents: [{ documentId: "1", name: input.documentName, fileExtension: "pdf", documentBase64: input.pdfBase64 }],
      recipients: {
        signers: [
          {
            email: input.signerEmail,
            name: input.signerName,
            recipientId: "1",
            tabs: { signHereTabs: [{ anchorString: "/sig1/", anchorUnits: "pixels", anchorXOffset: "0", anchorYOffset: "-10" }] },
          },
        ],
      },
    });
    return { envelopeId: created.envelopeId };
  }

  async getEnvelopeStatus(connection: DocusignConnection, envelopeId: string): Promise<EnvelopeStatus> {
    const result = await this.request(connection, "GET", `/envelopes/${envelopeId}`);
    return { status: result.status, completedAt: result.completedDateTime ?? null };
  }

  /** The signed document plus DocuSign's own certificate of completion, merged into one PDF. */
  async downloadCombinedDocument(connection: DocusignConnection, envelopeId: string): Promise<Buffer> {
    const url = `${connection.apiBaseUrl}/restapi/v2.1/accounts/${connection.accountId}/envelopes/${envelopeId}/documents/combined`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${connection.accessToken}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`DocuSign document download failed (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }

  private async ensureFreshToken(connection: DocusignConnection): Promise<DocusignConnection> {
    if (connection.tokenExpiresAt.getTime() - Date.now() > 60_000) return connection;

    const clientId = this.config.getOrThrow<string>("DOCUSIGN_CLIENT_ID");
    const clientSecret = this.config.getOrThrow<string>("DOCUSIGN_CLIENT_SECRET");
    const res = await fetch(`${this.oauthBaseUrl()}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: connection.refreshToken }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new BadRequestException("Failed to refresh the DocuSign connection — reconnect it in Settings");
    const tokens = (await res.json()) as TokenResponse;

    return this.prisma.docusignConnection.update({
      where: { id: connection.id },
      data: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      },
    });
  }

  private async exchangeCode(code: string): Promise<TokenResponse> {
    const clientId = this.config.getOrThrow<string>("DOCUSIGN_CLIENT_ID");
    const clientSecret = this.config.getOrThrow<string>("DOCUSIGN_CLIENT_SECRET");
    const res = await fetch(`${this.oauthBaseUrl()}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({ grant_type: "authorization_code", code }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new BadRequestException("DocuSign rejected the authorization code");
    return (await res.json()) as TokenResponse;
  }

  private async fetchUserInfo(accessToken: string): Promise<UserInfoResponse> {
    const res = await fetch(`${this.oauthBaseUrl()}/oauth/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new BadRequestException("Couldn't read the connected DocuSign account's info");
    return (await res.json()) as UserInfoResponse;
  }

  private async request(connection: DocusignConnection, method: "GET" | "POST", path: string, body?: unknown): Promise<any> {
    const url = `${connection.apiBaseUrl}/restapi/v2.1/accounts/${connection.accountId}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`DocuSign ${path} request failed (${res.status})`);
    return res.json();
  }

  private oauthBaseUrl(): string {
    return this.config.get<string>("DOCUSIGN_OAUTH_BASE_URL") ?? DOCUSIGN_DEMO_OAUTH_BASE_URL;
  }

  private callbackUrl(): string {
    const apiOrigin = this.config.get<string>("API_ORIGIN") ?? "http://localhost:4000/api";
    return `${apiOrigin}/auth/docusign/callback`;
  }
}
