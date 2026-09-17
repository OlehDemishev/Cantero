import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { PunchListItemStatus } from "@prisma/client";
import { PrismaService } from "../common/prisma/prisma.service";

const FETCH_TIMEOUT_MS = 10_000;
const STATE_TTL = "10m";
const APS_AUTH_BASE_URL = "https://developer.api.autodesk.com/authentication/v2";
const APS_API_BASE_URL = "https://developer.api.autodesk.com";
const APS_SCOPE = "data:read data:write account:read";

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

interface HubsResponse {
  data: { id: string }[];
}

export interface AutodeskConnection {
  id: string;
  companyId: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date;
  hubId: string;
}

export interface SyncSummary {
  synced: number;
  failed: number;
  errors: string[];
}

/** ACC's own status vocabulary for its generic Issues API — this project only has three punch-
 * list states, so this collapses them onto the closest ACC equivalents rather than attempting a
 * full mapping. */
const ACC_ISSUE_STATUS: Record<PunchListItemStatus, string> = {
  open: "open",
  resolved: "resolved",
  verified: "closed",
};

/**
 * Live OAuth2 (3-legged Authorization Code Grant via Autodesk Platform Services, formerly Forge)
 * push sync of punch list items into Autodesk Construction Cloud as Issues — ACC's generic
 * construction-issue-tracking primitive, the closest match to this app's PunchListItem. Structurally
 * the same OAuth2 shape as the other connectors in this file's siblings (authorize → callback →
 * refresh); APS is a real, modern, publicly documented, self-service-registration API (free APS
 * developer account), same confidence level as DocuSign/QuickBooks/Xero.
 *
 * Unlike those, an ACC *project* is never created by this app — construction companies set up
 * their ACC projects in Autodesk's own UI, so the company maps a local Project to an existing ACC
 * project by pasting in its id (Project.autodeskProjectId) rather than this app creating one, the
 * same "the company supplies one more piece of config" shape as MS Project's environmentUrl or
 * lexoffice's API key.
 *
 * **Some uncertainty on the exact Issues API request/response shape** (field names, the full set
 * of valid status values) — ACC's Issues API is one of Autodesk's better-documented construction
 * APIs, so this is closer to lexoffice's confidence level than MS Project's Dataverse guesswork,
 * but still not verified against a live account. Do one supervised test sync before relying on it.
 */
@Injectable()
export class AutodeskService {
  private readonly logger = new Logger(AutodeskService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  async getStatus(companyId: string) {
    const connection = await this.prisma.autodeskConnection.findUnique({ where: { companyId } });
    if (!connection) return { connected: false as const };
    return { connected: true as const, hubId: connection.hubId, connectedAt: connection.connectedAt };
  }

  getAuthorizeUrl(companyId: string): string {
    const clientId = this.config.get<string>("AUTODESK_CLIENT_ID");
    if (!clientId) {
      throw new BadRequestException("Autodesk isn't configured on this server — set AUTODESK_CLIENT_ID/AUTODESK_CLIENT_SECRET");
    }

    const state = this.jwt.sign({ companyId }, { expiresIn: STATE_TTL });
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: this.callbackUrl(),
      scope: APS_SCOPE,
      state,
    });
    return `${APS_AUTH_BASE_URL}/authorize?${params.toString()}`;
  }

  /** Verifies the signed state, exchanges the code, then calls GET /project/v1/hubs and picks the
   * first hub the authorizing user can see — there's no "which hub does this company mean"
   * question this app can ask ahead of time, so like DocuSign's default account, the first one
   * returned is what gets connected. Returns the companyId so the controller can redirect
   * appropriately even on later failures. */
  async handleCallback(code: string, state: string): Promise<{ companyId: string }> {
    let decoded: { companyId: string };
    try {
      decoded = this.jwt.verify(state);
    } catch {
      throw new BadRequestException("This connection link has expired — try connecting again");
    }
    const { companyId } = decoded;

    const tokens = await this.exchangeCode(code);
    const hubs = await this.fetchHubs(tokens.access_token);
    const hub = hubs.data[0];
    if (!hub) throw new BadRequestException("This Autodesk account has no accessible hub to connect");

    await this.prisma.autodeskConnection.upsert({
      where: { companyId },
      create: {
        companyId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        hubId: hub.id,
      },
      update: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        hubId: hub.id,
      },
    });
    return { companyId };
  }

  async disconnect(companyId: string): Promise<void> {
    await this.prisma.autodeskConnection.deleteMany({ where: { companyId } });
  }

  /** Maps this project to the given ACC project id (once — later calls just update it) and
   * pushes every not-yet-synced punch list item as an ACC Issue. One item's failure doesn't block
   * the rest, same shape as AccountingSyncService.syncInvoices(). */
  async syncPunchList(companyId: string, projectId: string, autodeskProjectId: string): Promise<SyncSummary> {
    const connection = await this.getConnectionOrThrow(companyId);
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");

    if (project.autodeskProjectId !== autodeskProjectId) {
      await this.prisma.project.update({ where: { id: projectId }, data: { autodeskProjectId } });
    }

    const items = await this.prisma.punchListItem.findMany({ where: { companyId, projectId, autodeskIssueId: null } });
    const summary: SyncSummary = { synced: 0, failed: 0, errors: [] };
    for (const item of items) {
      try {
        const created = await this.request(connection, "POST", `construction/issues/v1/projects/${autodeskProjectId}/issues`, {
          title: item.title,
          description: item.description ?? undefined,
          status: ACC_ISSUE_STATUS[item.status],
          dueDate: item.dueDate ? item.dueDate.toISOString().slice(0, 10) : undefined,
        });
        await this.prisma.punchListItem.update({ where: { id: item.id }, data: { autodeskIssueId: created.id } });
        summary.synced++;
      } catch (err) {
        const message = err instanceof Error ? err.message : "sync failed";
        summary.failed++;
        summary.errors.push(`${item.title}: ${message}`);
        this.logger.warn(`Autodesk issue sync failed for punch list item ${item.id}: ${message}`);
      }
    }
    return summary;
  }

  private async getConnectionOrThrow(companyId: string): Promise<AutodeskConnection> {
    const connection = await this.prisma.autodeskConnection.findUnique({ where: { companyId } });
    if (!connection) throw new NotFoundException("No Autodesk account connected");
    return this.ensureFreshToken(connection);
  }

  private async ensureFreshToken(connection: AutodeskConnection): Promise<AutodeskConnection> {
    if (connection.tokenExpiresAt.getTime() - Date.now() > 60_000) return connection;

    const clientId = this.config.getOrThrow<string>("AUTODESK_CLIENT_ID");
    const clientSecret = this.config.getOrThrow<string>("AUTODESK_CLIENT_SECRET");
    const res = await fetch(`${APS_AUTH_BASE_URL}/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: connection.refreshToken }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new BadRequestException("Failed to refresh the Autodesk connection — reconnect it in Settings");
    const tokens = (await res.json()) as TokenResponse;

    return this.prisma.autodeskConnection.update({
      where: { id: connection.id },
      data: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      },
    });
  }

  private async exchangeCode(code: string): Promise<TokenResponse> {
    const clientId = this.config.getOrThrow<string>("AUTODESK_CLIENT_ID");
    const clientSecret = this.config.getOrThrow<string>("AUTODESK_CLIENT_SECRET");
    const res = await fetch(`${APS_AUTH_BASE_URL}/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: this.callbackUrl() }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new BadRequestException("Autodesk rejected the authorization code");
    return (await res.json()) as TokenResponse;
  }

  private async fetchHubs(accessToken: string): Promise<HubsResponse> {
    const res = await fetch(`${APS_API_BASE_URL}/project/v1/hubs`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new BadRequestException("Couldn't list the connected Autodesk account's hubs");
    return (await res.json()) as HubsResponse;
  }

  private async request(connection: AutodeskConnection, method: "POST", path: string, body: unknown): Promise<any> {
    const res = await fetch(`${APS_API_BASE_URL}/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Autodesk ${path} request failed (${res.status})`);
    return res.json();
  }

  private callbackUrl(): string {
    const apiOrigin = this.config.get<string>("API_ORIGIN") ?? "http://localhost:4000/api";
    return `${apiOrigin}/auth/autodesk/callback`;
  }
}
