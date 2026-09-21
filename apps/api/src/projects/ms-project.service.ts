import { randomUUID } from "node:crypto";
import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../common/prisma/prisma.service";
import { callbackUrl, exchangeCode, refreshIfExpiring, requestToken, signState, tokenExpiry, verifyState, type TokenEndpoint } from "../common/oauth/oauth";

const FETCH_TIMEOUT_MS = 10_000;
const MICROSOFT_IDENTITY_BASE_URL = "https://login.microsoftonline.com/common/oauth2/v2.0";
/** Microsoft's documented cap on operations per OperationSet. */
const OPERATION_SET_LIMIT = 200;

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
 * The task push follows Microsoft's published Project schedule API contract (see syncProject);
 * it hasn't been run against a live Project for the Web environment from here, so do one
 * supervised sync against a real (licensed) environment before relying on it.
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

    const state = signState(this.jwt, { companyId, environmentUrl: normalizedUrl });
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: this.callbackUrl(),
      scope: scopeFor(normalizedUrl),
      state,
    });
    return `${MICROSOFT_IDENTITY_BASE_URL}/authorize?${params.toString()}`;
  }

  /** Verifies the signed state (which carries the environmentUrl chosen at getAuthorizeUrl time,
   * since Dataverse tokens are scoped to one environment and can't be discovered after the fact
   * the way DocuSign's account info can), then exchanges the code. Returns the companyId so the
   * controller can redirect appropriately even on later failures. */
  async handleCallback(code: string, state: string): Promise<{ companyId: string }> {
    const { companyId, environmentUrl } = verifyState<{ companyId: string; environmentUrl: string }>(this.jwt, state);

    const tokens = await exchangeCode(this.tokenEndpoint(), { code, redirect_uri: this.callbackUrl(), scope: scopeFor(environmentUrl) });

    await this.prisma.msProjectConnection.upsert({
      where: { companyId },
      create: {
        companyId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt: tokenExpiry(tokens),
        environmentUrl,
      },
      update: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt: tokenExpiry(tokens),
        environmentUrl,
      },
    });
    return { companyId };
  }

  async disconnect(companyId: string): Promise<void> {
    await this.prisma.msProjectConnection.deleteMany({ where: { companyId } });
  }

  /**
   * Pushes this project and its not-yet-synced tasks through Microsoft's Project schedule APIs —
   * the only supported way to create msdyn_projecttask rows (a plain Dataverse POST to
   * msdyn_projecttasks is refused; tasks belong to the scheduling engine). Per the documented
   * contract (learn.microsoft.com → "Use Project schedule APIs to perform operations with
   * Scheduling entities", and its Power Automate walkthrough for the JSON shapes):
   *
   * 1. msdyn_CreateProjectV1 creates the project and its default bucket (once per project).
   * 2. msdyn_CreateOperationSetV1 opens a transaction for the project.
   * 3. msdyn_PssCreateV1 queues each task into it — every task needs a bucket, so if the project
   *    has none (e.g. it was created as a plain row by an earlier version of this code) one is
   *    queued first.
   * 4. msdyn_ExecuteOperationSetV1 applies them together, so a batch lands whole or not at all.
   *
   * Task IDs are generated here and sent in the payload (the API accepts caller-supplied IDs), so
   * they're known without reading anything back. Execution itself is asynchronous on Microsoft's
   * side; a set that's accepted here but fails later isn't detected by this call. Only users with a
   * Project license can call these APIs — application/service users can't.
   */
  async syncProject(companyId: string, projectId: string): Promise<SyncSummary> {
    const connection = await this.getConnectionOrThrow(companyId);
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");

    let externalProjectId = project.msProjectExternalId;
    if (!externalProjectId) {
      const created = await this.request(connection, "POST", "msdyn_CreateProjectV1", {
        Project: { "@odata.type": "Microsoft.Dynamics.CRM.msdyn_project", msdyn_subject: project.name },
      });
      externalProjectId = created.ProjectId as string;
      if (!externalProjectId) throw new BadRequestException("MS Project accepted the project but returned no ProjectId");
      await this.prisma.project.update({ where: { id: projectId }, data: { msProjectExternalId: externalProjectId } });
    }

    const tasks = await this.prisma.task.findMany({ where: { companyId, projectId, msProjectExternalId: null }, orderBy: { sortOrder: "asc" } });
    if (tasks.length === 0) return { synced: 0, failed: 0, errors: [] };

    const summary: SyncSummary = { synced: 0, failed: 0, errors: [] };
    let bucketId = await this.findBucket(connection, externalProjectId);
    for (let i = 0; i < tasks.length; ) {
      const needsBucket = !bucketId;
      const batch = tasks.slice(i, i + OPERATION_SET_LIMIT - (needsBucket ? 1 : 0));
      i += batch.length;
      try {
        const opened = await this.request(connection, "POST", "msdyn_CreateOperationSetV1", { ProjectId: externalProjectId, Description: `Cantero sync ${new Date().toISOString()}` });
        const operationSetId = opened.OperationSetId as string;
        if (needsBucket) {
          const newBucketId = randomUUID();
          await this.pssCreate(connection, operationSetId, {
            "@odata.type": "Microsoft.Dynamics.CRM.msdyn_projectbucket",
            msdyn_projectbucketid: newBucketId,
            msdyn_name: "Cantero",
            "msdyn_project@odata.bind": `/msdyn_projects(${externalProjectId})`,
          });
          bucketId = newBucketId;
        }
        const ids = new Map<string, string>();
        for (const task of batch) {
          const taskId = randomUUID();
          ids.set(task.id, taskId);
          await this.pssCreate(connection, operationSetId, {
            "@odata.type": "Microsoft.Dynamics.CRM.msdyn_projecttask",
            msdyn_projecttaskid: taskId,
            msdyn_subject: task.name,
            "msdyn_project@odata.bind": `/msdyn_projects(${externalProjectId})`,
            "msdyn_projectbucket@odata.bind": `/msdyn_projectbuckets(${bucketId})`,
            ...(task.startDate ? { msdyn_start: task.startDate.toISOString(), msdyn_scheduledstart: task.startDate.toISOString() } : {}),
            ...(task.dueDate ? { msdyn_scheduledend: task.dueDate.toISOString() } : {}),
          });
        }
        await this.request(connection, "POST", "msdyn_ExecuteOperationSetV1", { OperationSetId: operationSetId });
        await this.prisma.$transaction(batch.map((t) => this.prisma.task.update({ where: { id: t.id }, data: { msProjectExternalId: ids.get(t.id)! } })));
        summary.synced += batch.length;
      } catch (err) {
        const message = err instanceof Error ? err.message : "sync failed";
        summary.failed += batch.length;
        summary.errors.push(`${batch.length} task(s): ${message}`);
        this.logger.warn(`MS Project operation set failed for project ${projectId}: ${message}`);
        if (needsBucket) bucketId = null; // the queued bucket was never created
      }
    }
    return summary;
  }

  private pssCreate(connection: MsProjectConnection, operationSetId: string, entity: Record<string, unknown>) {
    return this.request(connection, "POST", "msdyn_PssCreateV1", { Entity: entity, OperationSetId: operationSetId });
  }

  private async findBucket(connection: MsProjectConnection, externalProjectId: string): Promise<string | null> {
    const res = await this.request(
      connection,
      "GET",
      `msdyn_projectbuckets?$select=msdyn_projectbucketid&$filter=_msdyn_project_value eq ${externalProjectId}&$top=1`,
    );
    return res?.value?.[0]?.msdyn_projectbucketid ?? null;
  }

  private async getConnectionOrThrow(companyId: string): Promise<MsProjectConnection> {
    const connection = await this.prisma.msProjectConnection.findUnique({ where: { companyId } });
    if (!connection) throw new NotFoundException("No MS Project environment connected");
    return this.ensureFreshToken(connection);
  }

  private ensureFreshToken(connection: MsProjectConnection): Promise<MsProjectConnection> {
    return refreshIfExpiring(connection, {
      kind: "ms-project",
      reconnectMessage: "Failed to refresh the MS Project connection — reconnect it in Settings",
      reload: () => this.prisma.msProjectConnection.findUnique({ where: { id: connection.id } }),
      refresh: async (c) => {
        const tokens = await requestToken(this.tokenEndpoint(), { grant_type: "refresh_token", refresh_token: c.refreshToken, scope: scopeFor(c.environmentUrl) });
        return this.prisma.msProjectConnection.update({
          where: { id: c.id },
          data: { accessToken: tokens.access_token, refreshToken: tokens.refresh_token ?? c.refreshToken, tokenExpiresAt: tokenExpiry(tokens) },
        });
      },
    });
  }

  private tokenEndpoint(): TokenEndpoint {
    return {
      provider: "Microsoft",
      url: `${MICROSOFT_IDENTITY_BASE_URL}/token`,
      clientId: this.config.getOrThrow<string>("MS_PROJECT_CLIENT_ID"),
      clientSecret: this.config.getOrThrow<string>("MS_PROJECT_CLIENT_SECRET"),
      clientAuth: "body",
    };
  }

  /** Unbound actions (msdyn_*V1) and entity-set reads over the Dataverse Web API. Errors carry
   * Dataverse's own message, which is what says *why* a schedule operation was refused. */
  private async request(connection: MsProjectConnection, method: "GET" | "POST", path: string, body?: unknown): Promise<any> {
    const res = await fetch(`${connection.environmentUrl}/api/data/v9.2/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
        Accept: "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      let detail = "";
      try {
        detail = (await res.json())?.error?.message ?? "";
      } catch {
        // non-JSON error body
      }
      throw new Error(`MS Project ${path.split("?")[0]} failed (${res.status})${detail ? `: ${detail}` : ""}`);
    }
    if (res.status === 204) return undefined;
    return res.json();
  }

  private callbackUrl(): string {
    return callbackUrl(this.config, "ms-project");
  }
}

/** Dataverse tokens are per environment; offline_access is what gets a refresh token. */
function scopeFor(environmentUrl: string): string {
  return `${environmentUrl}/.default offline_access`;
}
