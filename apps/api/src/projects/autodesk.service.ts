import { BadGatewayException, BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { PunchListItemStatus } from "@prisma/client";
import { PrismaService } from "../common/prisma/prisma.service";
import {
  OAuthTokenError,
  callbackUrl,
  exchangeCode,
  refreshIfExpiring,
  requestToken,
  signState,
  tokenExpiry,
  verifyState,
  type OAuthTokens,
  type TokenEndpoint,
} from "../common/oauth/oauth";

const FETCH_TIMEOUT_MS = 10_000;
const APS_AUTH_BASE_URL = "https://developer.api.autodesk.com/authentication/v2";
const APS_API_BASE_URL = "https://developer.api.autodesk.com";
const APS_SCOPE = "data:read data:write account:read";
/** What the browser-side Viewer gets. APS's recommended split: the server keeps the full-scope
 * token, the page gets one that can only stream derivatives (viewables:read is within data:read, so
 * a refresh can narrow to it). */
const APS_VIEWER_SCOPE = "viewables:read";
/** Viewer `api` per hub region (InitOptions docs: streamingV2 = SVF2 from the US data center,
 * _EU / _AUS for the European / Australian ones). */
const VIEWER_API_BY_REGION: Record<string, string> = { US: "streamingV2", EMEA: "streamingV2_EU", AUS: "streamingV2_AUS" };
const FOLDER_PAGE_LIMIT = 200;
/** A Model Derivative URN is URL-safe base64 of a version id. */
const URN_PATTERN = /^[A-Za-z0-9_-]{20,600}$/;

interface HubsResponse {
  data: { id: string; attributes?: { region?: string } }[];
}

interface DmResource {
  type: string;
  id: string;
  attributes: { name?: string; displayName?: string; hidden?: boolean; versionNumber?: number };
  relationships?: {
    tip?: { data?: { id: string } };
    derivatives?: { data?: { id: string } };
  };
}

export interface ModelBrowserEntry {
  kind: "folder" | "file";
  id: string;
  name: string;
  /** Files only: URN of the tip version's derivatives, what the Viewer loads. */
  urn?: string;
  versionNumber?: number;
}

export interface ViewerToken {
  accessToken: string;
  expiresIn: number;
  /** Viewer InitOptions.api for the hub's data region. */
  api: string;
}

export interface AutodeskConnection {
  id: string;
  companyId: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date;
  hubId: string;
  hubRegion?: string | null;
  viewerAccessToken?: string | null;
}

export interface SyncSummary {
  synced: number;
  failed: number;
  errors: string[];
}

/** ACC's own status vocabulary for its generic Issues API — this project only has three punch-
 * list states, so this collapses them onto the closest ACC equivalents rather than attempting a
 * full mapping. */
/** Values from the documented POST issues status enum (draft, open, pending, in_progress,
 * completed, in_review, not_approved, in_dispute, closed) — "resolved" isn't one of them. */
const ACC_ISSUE_STATUS: Record<PunchListItemStatus, string> = {
  open: "open",
  resolved: "completed",
  verified: "closed",
};
const ACC_TITLE_MAX = 100;
const ACC_DESCRIPTION_MAX = 1000;

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
 *
 * The same connection also backs the project's BIM viewer: browseModels() walks the mapped ACC
 * project's Docs folders (Data Management API), setModel() pins one file version's derivatives,
 * and getViewerToken() hands the browser a viewables:read-only token to stream them with. ACC
 * translates uploaded models for viewing itself, so nothing is submitted to Model Derivative here.
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

    const state = signState(this.jwt, { companyId });
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
    const { companyId } = verifyState(this.jwt, state);

    const tokens = await exchangeCode(this.tokenEndpoint(), { code, redirect_uri: this.callbackUrl() });
    const hubs = await this.fetchHubs(tokens.access_token);
    const hub = hubs.data[0];
    if (!hub) throw new BadRequestException("This Autodesk account has no accessible hub to connect");
    const viewer = await this.viewerRefresh(tokens.refresh_token).catch((err: unknown) => {
      if (err instanceof OAuthTokenError) throw new BadRequestException("Autodesk refused a viewing token for this account — try connecting again");
      throw err;
    });

    const data = {
      accessToken: tokens.access_token,
      viewerAccessToken: viewer.access_token,
      refreshToken: viewer.refresh_token ?? tokens.refresh_token,
      tokenExpiresAt: tokenExpiry({ ...viewer, expires_in: Math.min(tokens.expires_in, viewer.expires_in) }),
      hubId: hub.id,
      hubRegion: hub.attributes?.region ?? null,
    };
    await this.prisma.autodeskConnection.upsert({ where: { companyId }, create: { companyId, ...data }, update: data });
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
    if (items.length === 0) return { synced: 0, failed: 0, errors: [] };

    // The Issues API wants the bare project UUID; Data Management hands it out with a "b." prefix.
    const accProjectId = autodeskProjectId.replace(/^b\./, "");
    const issueSubtypeId = await this.pickIssueSubtype(connection, accProjectId).catch((err: unknown) => this.rethrowForUser(err));
    const summary: SyncSummary = { synced: 0, failed: 0, errors: [] };
    for (const item of items) {
      try {
        const created = await this.request(connection, "POST", `construction/issues/v1/projects/${accProjectId}/issues`, {
          title: item.title.slice(0, ACC_TITLE_MAX),
          ...(item.description ? { description: item.description.slice(0, ACC_DESCRIPTION_MAX) } : {}),
          issueSubtypeId,
          status: ACC_ISSUE_STATUS[item.status],
          ...(item.dueDate ? { dueDate: item.dueDate.toISOString().slice(0, 10) } : {}),
          // Unpublished issues are only visible to their creator, which defeats the point of pushing
          // the punch list to the team's ACC project.
          published: true,
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

  /** One level of the mapped ACC project's Docs tree: its top folders when `folderId` is omitted,
   * otherwise that folder's subfolders and files (each file with its tip version's URN). Deleted
   * entries are hidden by the API by default; `truncated` is set when the folder has more than one
   * page (200 entries) — only the first page is listed. */
  async browseModels(companyId: string, projectId: string, folderId?: string): Promise<{ entries: ModelBrowserEntry[]; truncated: boolean }> {
    const connection = await this.getConnectionOrThrow(companyId);
    const dmProjectId = await this.dataManagementProjectId(companyId, projectId);
    return this.listFolder(connection, dmProjectId, folderId).catch((err: unknown) => this.rethrowForUser(err));
  }

  /** Turns an Autodesk API failure into something the person can act on instead of a 500. */
  private rethrowForUser(err: unknown): never {
    if (!(err instanceof AutodeskApiError)) throw err;
    this.logger.warn(err.message);
    if (err.status === 401) throw new BadRequestException("Autodesk no longer accepts this connection — reconnect it in Settings");
    if (err.status === 403) throw new BadRequestException("The connected Autodesk account can't open this ACC project or folder — ask an ACC project admin for access");
    if (err.status === 404) throw new BadRequestException("Autodesk has no such project in the connected hub — check the ACC project ID");
    throw new BadGatewayException("Autodesk didn't answer properly — try again in a moment");
  }

  private async listFolder(connection: AutodeskConnection, dmProjectId: string, folderId?: string): Promise<{ entries: ModelBrowserEntry[]; truncated: boolean }> {

    if (!folderId) {
      const res = await this.request(connection, "GET", `project/v1/hubs/${encodeURIComponent(connection.hubId)}/projects/${encodeURIComponent(dmProjectId)}/topFolders?excludeDeleted=true`);
      const entries = ((res?.data ?? []) as DmResource[])
        .filter((f) => !f.attributes.hidden)
        .map((f) => ({ kind: "folder" as const, id: f.id, name: f.attributes.displayName ?? f.attributes.name ?? f.id }));
      return { entries, truncated: false };
    }

    const res = await this.request(
      connection,
      "GET",
      `data/v1/projects/${encodeURIComponent(dmProjectId)}/folders/${encodeURIComponent(folderId)}/contents?page%5Blimit%5D=${FOLDER_PAGE_LIMIT}`,
    );
    const versions = new Map(((res?.included ?? []) as DmResource[]).filter((r) => r.type === "versions").map((v) => [v.id, v]));
    const entries: ModelBrowserEntry[] = [];
    for (const r of (res?.data ?? []) as DmResource[]) {
      if (r.attributes.hidden) continue;
      const name = r.attributes.displayName ?? r.attributes.name ?? r.id;
      if (r.type === "folders") {
        entries.push({ kind: "folder", id: r.id, name });
      } else if (r.type === "items") {
        const tipId = r.relationships?.tip?.data?.id;
        if (!tipId) continue;
        const tip = versions.get(tipId);
        entries.push({
          kind: "file",
          id: r.id,
          name,
          urn: tip?.relationships?.derivatives?.data?.id ?? versionUrn(tipId),
          ...(tip?.attributes.versionNumber ? { versionNumber: tip.attributes.versionNumber } : {}),
        });
      }
    }
    entries.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "folder" ? -1 : 1));
    return { entries, truncated: Boolean(res?.links?.next) };
  }

  /** Maps a local project to its ACC project (the id from the ACC URL, with or without "b.").
   * Changing it drops the pinned model, which belongs to the old ACC project. */
  async linkProject(companyId: string, projectId: string, autodeskProjectId: string) {
    const id = autodeskProjectId.trim();
    if (!/^(b\.)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new BadRequestException("An ACC project ID looks like 1a2b3c4d-… (copy it from the project's URL in Autodesk Construction Cloud)");
    }
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId }, select: { autodeskProjectId: true } });
    if (!project) throw new NotFoundException("Project not found");
    const changed = project.autodeskProjectId !== id;
    return this.prisma.project.update({
      where: { id: projectId },
      data: { autodeskProjectId: id, ...(changed ? { autodeskModelUrn: null, autodeskModelName: null } : {}) },
      select: { autodeskProjectId: true, autodeskModelUrn: true, autodeskModelName: true },
    });
  }

  /** Pins the model the project's viewer shows, or clears it with `null`. */
  async setModel(companyId: string, projectId: string, model: { urn: string; name: string } | null) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId }, select: { id: true } });
    if (!project) throw new NotFoundException("Project not found");
    if (model && !URN_PATTERN.test(model.urn)) throw new BadRequestException("That isn't a model URN");
    return this.prisma.project.update({
      where: { id: projectId },
      data: { autodeskModelUrn: model?.urn ?? null, autodeskModelName: model ? model.name.slice(0, 200) : null },
      select: { autodeskModelUrn: true, autodeskModelName: true },
    });
  }

  /** The browser-side token for the Autodesk Viewer: viewables:read only, so it can stream model
   * derivatives but can't list, download or change anything in the company's Autodesk account. */
  async getViewerToken(companyId: string): Promise<ViewerToken> {
    const connection = await this.getConnectionOrThrow(companyId);
    if (!connection.viewerAccessToken) throw new BadRequestException("Reconnect Autodesk in Settings to enable the model viewer");
    return {
      accessToken: connection.viewerAccessToken,
      expiresIn: Math.max(0, Math.floor((connection.tokenExpiresAt.getTime() - Date.now()) / 1000)),
      api: VIEWER_API_BY_REGION[connection.hubRegion ?? "US"] ?? VIEWER_API_BY_REGION.US,
    };
  }

  /** Data Management wants the project id with its "b." prefix; the Issues API and ACC's own URLs
   * use the bare UUID, which is what people usually paste. Accept either. */
  private async dataManagementProjectId(companyId: string, projectId: string): Promise<string> {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId }, select: { autodeskProjectId: true } });
    if (!project) throw new NotFoundException("Project not found");
    if (!project.autodeskProjectId) throw new BadRequestException("Link this project to an Autodesk Construction Cloud project first");
    return project.autodeskProjectId.startsWith("b.") ? project.autodeskProjectId : `b.${project.autodeskProjectId}`;
  }

  /** issueSubtypeId is required on every created issue. Prefers a category or type named like
   * "punch" (ACC's usual punch-list setup), otherwise the first active, editable type. */
  private async pickIssueSubtype(connection: AutodeskConnection, accProjectId: string): Promise<string> {
    const res = await this.request(connection, "GET", `construction/issues/v1/projects/${accProjectId}/issue-types?include=subtypes&limit=200`);
    const candidates = ((res?.results ?? []) as { title: string; isActive: boolean; subtypes?: { id: string; title: string; isActive: boolean; isReadOnly?: boolean }[] }[])
      .filter((type) => type.isActive)
      .flatMap((type) => (type.subtypes ?? []).filter((sub) => sub.isActive && !sub.isReadOnly).map((sub) => ({ id: sub.id, label: `${type.title} ${sub.title}` })));
    const chosen = candidates.find((c) => /punch/i.test(c.label)) ?? candidates[0];
    if (!chosen) throw new BadRequestException("This Autodesk project has no active issue types to file punch list items under");
    return chosen.id;
  }

  private async getConnectionOrThrow(companyId: string): Promise<AutodeskConnection> {
    const connection = await this.prisma.autodeskConnection.findUnique({ where: { companyId } });
    if (!connection) throw new NotFoundException("No Autodesk account connected");
    return this.ensureFreshToken(connection);
  }

  /** Refreshes twice, as APS's hubs-browser tutorial does: once with the full scope for the
   * server's token, then with the narrowed viewer scope. Refresh tokens are single-use, so each
   * step is saved as soon as it succeeds — if the viewer step then fails, the connection still
   * holds a live refresh token instead of a spent one, and the missing viewer token makes the
   * next call try again. The full scope is requested explicitly because the stored refresh token
   * comes from a viewer-scoped refresh. A connection without a viewer token (made before the
   * viewer existed) refreshes early so it gets one. */
  private ensureFreshToken(connection: AutodeskConnection): Promise<AutodeskConnection> {
    return refreshIfExpiring(connection, {
      kind: "autodesk",
      force: !connection.viewerAccessToken,
      reconnectMessage: "Failed to refresh the Autodesk connection — reconnect it in Settings",
      reload: () => this.prisma.autodeskConnection.findUnique({ where: { id: connection.id } }),
      refresh: async (c) => {
        const server = await requestToken(this.tokenEndpoint(), { grant_type: "refresh_token", refresh_token: c.refreshToken, scope: APS_SCOPE });
        const serverRefreshToken = server.refresh_token ?? c.refreshToken;
        await this.prisma.autodeskConnection.update({
          where: { id: c.id },
          data: { accessToken: server.access_token, viewerAccessToken: null, refreshToken: serverRefreshToken, tokenExpiresAt: tokenExpiry(server) },
        });
        const viewer = await this.viewerRefresh(serverRefreshToken);
        return this.prisma.autodeskConnection.update({
          where: { id: c.id },
          data: {
            viewerAccessToken: viewer.access_token,
            refreshToken: viewer.refresh_token ?? serverRefreshToken,
            // Minted moments apart; the earlier expiry bounds both.
            tokenExpiresAt: tokenExpiry({ ...viewer, expires_in: Math.min(server.expires_in, viewer.expires_in) }),
          },
        });
      },
    });
  }

  private viewerRefresh(refreshToken: string): Promise<OAuthTokens> {
    return requestToken(this.tokenEndpoint(), { grant_type: "refresh_token", refresh_token: refreshToken, scope: APS_VIEWER_SCOPE });
  }

  private tokenEndpoint(): TokenEndpoint {
    return {
      provider: "Autodesk",
      url: `${APS_AUTH_BASE_URL}/token`,
      clientId: this.config.getOrThrow<string>("AUTODESK_CLIENT_ID"),
      clientSecret: this.config.getOrThrow<string>("AUTODESK_CLIENT_SECRET"),
      clientAuth: "basic",
    };
  }

  private async fetchHubs(accessToken: string): Promise<HubsResponse> {
    const res = await fetch(`${APS_API_BASE_URL}/project/v1/hubs`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new BadRequestException("Couldn't list the connected Autodesk account's hubs");
    return (await res.json()) as HubsResponse;
  }

  private async request(connection: AutodeskConnection, method: "GET" | "POST", path: string, body?: unknown): Promise<any> {
    const res = await fetch(`${APS_API_BASE_URL}/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      let detail = "";
      try {
        const err = await res.json();
        detail = err?.detail ?? err?.title ?? err?.message ?? "";
      } catch {
        // non-JSON error body
      }
      throw new AutodeskApiError(res.status, `Autodesk ${path.split("?")[0]} failed (${res.status})${detail ? `: ${detail}` : ""}`);
    }
    return res.json();
  }

  private callbackUrl(): string {
    return callbackUrl(this.config, "autodesk");
  }
}

class AutodeskApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** The URN the Viewer loads for a Data Management version id: its URL-safe base64, unpadded. */
export function versionUrn(versionId: string): string {
  return Buffer.from(versionId).toString("base64url");
}
