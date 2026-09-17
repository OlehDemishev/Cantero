import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../common/prisma/prisma.service";

const FETCH_TIMEOUT_MS = 10_000;
const STATE_TTL = "10m";
const MICROSOFT_IDENTITY_BASE_URL = "https://login.microsoftonline.com/common/oauth2/v2.0";

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface MsProjectConnection {
  id: string;
  companyId: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date;
  environmentUrl: string;
}

export interface SyncSummary {
  synced: number;
  failed: number;
  errors: string[];
}

/**
 * Live OAuth2 (Microsoft identity platform, Authorization Code Grant) push sync to "Project for
 * the Web" — Microsoft's current cloud Project product, which stores its data in a Power
 * Platform/Dataverse environment rather than behind a single fixed API host. Unlike QuickBooks/
 * Xero/DocuSign there's no directory lookup this app can call to find "this company's Project
 * environment" — the company supplies their own Dataverse environmentUrl (from Power Platform
 * admin center) when connecting, the same one-more-piece-of-config shape as lexoffice's API key,
 * except it's also folded into the OAuth resource/scope since Dataverse's OAuth tokens are
 * audience-restricted to one environment.
 *
 * **Lower confidence than the QuickBooks/Xero/DocuSign connectors.** The OAuth2 mechanics
 * (authorize → callback → refresh) are standard Microsoft identity platform and solid, but the
 * Dataverse entity/field names below (msdyn_project, msdyn_projecttask, msdyn_subject, ...) are a
 * good-faith reconstruction of Project for the Web's schema from training knowledge, not
 * something verified against a live environment — more uncertain than lexoffice's contacts/
 * invoices endpoints, which are at least publicly documented REST resources I had direct
 * confidence in. **Do one supervised test sync against a real Project for the Web environment,
 * and be ready to correct field names from the actual entity metadata
 * (`{environmentUrl}/api/data/v9.2/EntityDefinitions`), before relying on this.**
 */
@Injectable()
export class MsProjectService {
  private readonly logger = new Logger(MsProjectService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  async getStatus(companyId: string) {
    const connection = await this.prisma.msProjectConnection.findUnique({ where: { companyId } });
    if (!connection) return { connected: false as const };
    return { connected: true as const, environmentUrl: connection.environmentUrl, connectedAt: connection.connectedAt };
  }

  getAuthorizeUrl(companyId: string, environmentUrl: string): string {
    const clientId = this.config.get<string>("MS_PROJECT_CLIENT_ID");
    if (!clientId) {
      throw new BadRequestException("MS Project isn't configured on this server — set MS_PROJECT_CLIENT_ID/MS_PROJECT_CLIENT_SECRET");
    }
    const normalizedUrl = environmentUrl.replace(/\/+$/, "");

    const state = this.jwt.sign({ companyId, environmentUrl: normalizedUrl }, { expiresIn: STATE_TTL });
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: this.callbackUrl(),
      scope: `${normalizedUrl}/.default offline_access`,
      state,
    });
    return `${MICROSOFT_IDENTITY_BASE_URL}/authorize?${params.toString()}`;
  }

  /** Verifies the signed state (which carries the environmentUrl chosen at getAuthorizeUrl time,
   * since Dataverse tokens are scoped to one environment and can't be discovered after the fact
   * the way DocuSign's account info can), then exchanges the code. Returns the companyId so the
   * controller can redirect appropriately even on later failures. */
  async handleCallback(code: string, state: string): Promise<{ companyId: string }> {
    let decoded: { companyId: string; environmentUrl: string };
    try {
      decoded = this.jwt.verify(state);
    } catch {
      throw new BadRequestException("This connection link has expired — try connecting again");
    }
    const { companyId, environmentUrl } = decoded;

    const tokens = await this.exchangeCode(code, environmentUrl);

    await this.prisma.msProjectConnection.upsert({
      where: { companyId },
      create: {
        companyId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        environmentUrl,
      },
      update: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        environmentUrl,
      },
    });
    return { companyId };
  }

  async disconnect(companyId: string): Promise<void> {
    await this.prisma.msProjectConnection.deleteMany({ where: { companyId } });
  }

  /** Pushes this project (creating the remote msdyn_project first if needed) and every one of its
   * not-yet-synced tasks. One task's failure doesn't block the rest — same shape as
   * AccountingSyncService.syncInvoices(). */
  async syncProject(companyId: string, projectId: string): Promise<SyncSummary> {
    const connection = await this.getConnectionOrThrow(companyId);
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");

    let externalProjectId = project.msProjectExternalId;
    if (!externalProjectId) {
      const created = await this.request(connection, "POST", "msdyn_projects", { msdyn_subject: project.name });
      externalProjectId = created.msdyn_projectid;
      await this.prisma.project.update({ where: { id: projectId }, data: { msProjectExternalId: externalProjectId } });
    }

    const tasks = await this.prisma.task.findMany({ where: { companyId, projectId, msProjectExternalId: null } });
    const summary: SyncSummary = { synced: 0, failed: 0, errors: [] };
    for (const task of tasks) {
      try {
        const created = await this.request(connection, "POST", "msdyn_projecttasks", {
          msdyn_subject: task.name,
          "msdyn_ProjectId@odata.bind": `/msdyn_projects(${externalProjectId})`,
          ...(task.startDate ? { msdyn_start: task.startDate.toISOString() } : {}),
          ...(task.dueDate ? { msdyn_finish: task.dueDate.toISOString() } : {}),
        });
        await this.prisma.task.update({ where: { id: task.id }, data: { msProjectExternalId: created.msdyn_projecttaskid } });
        summary.synced++;
      } catch (err) {
        const message = err instanceof Error ? err.message : "sync failed";
        summary.failed++;
        summary.errors.push(`${task.name}: ${message}`);
        this.logger.warn(`MS Project task sync failed for task ${task.id}: ${message}`);
      }
    }
    return summary;
  }

  private async getConnectionOrThrow(companyId: string): Promise<MsProjectConnection> {
    const connection = await this.prisma.msProjectConnection.findUnique({ where: { companyId } });
    if (!connection) throw new NotFoundException("No MS Project environment connected");
    return this.ensureFreshToken(connection);
  }

  private async ensureFreshToken(connection: MsProjectConnection): Promise<MsProjectConnection> {
    if (connection.tokenExpiresAt.getTime() - Date.now() > 60_000) return connection;

    const clientId = this.config.getOrThrow<string>("MS_PROJECT_CLIENT_ID");
    const clientSecret = this.config.getOrThrow<string>("MS_PROJECT_CLIENT_SECRET");
    const res = await fetch(`${MICROSOFT_IDENTITY_BASE_URL}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: connection.refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        scope: `${connection.environmentUrl}/.default offline_access`,
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new BadRequestException("Failed to refresh the MS Project connection — reconnect it in Settings");
    const tokens = (await res.json()) as TokenResponse;

    return this.prisma.msProjectConnection.update({
      where: { id: connection.id },
      data: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      },
    });
  }

  private async exchangeCode(code: string, environmentUrl: string): Promise<TokenResponse> {
    const clientId = this.config.getOrThrow<string>("MS_PROJECT_CLIENT_ID");
    const clientSecret = this.config.getOrThrow<string>("MS_PROJECT_CLIENT_SECRET");
    const res = await fetch(`${MICROSOFT_IDENTITY_BASE_URL}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: this.callbackUrl(),
        scope: `${environmentUrl}/.default offline_access`,
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new BadRequestException("Microsoft rejected the authorization code");
    return (await res.json()) as TokenResponse;
  }

  /** `Prefer: return=representation` is a standard Dataverse/OData convention — a POST otherwise
   * returns 204 No Content and the new row's id would need parsing out of the OData-EntityId
   * response header instead. */
  private async request(connection: MsProjectConnection, method: "POST", path: string, body: unknown): Promise<any> {
    const res = await fetch(`${connection.environmentUrl}/api/data/v9.2/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        Prefer: "return=representation",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`MS Project ${path} request failed (${res.status})`);
    return res.json();
  }

  private callbackUrl(): string {
    const apiOrigin = this.config.get<string>("API_ORIGIN") ?? "http://localhost:4000/api";
    return `${apiOrigin}/auth/ms-project/callback`;
  }
}
