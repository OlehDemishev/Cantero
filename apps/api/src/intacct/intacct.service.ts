import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { PushIntacctContractInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";

const FETCH_TIMEOUT_MS = 15_000;
const STATE_TTL = "10m";
const DEFAULT_BASE_URL = "https://api.intacct.com/ia/api/v1";

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

export interface IntacctConnection {
  id: string;
  companyId: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date;
  changeOrderItemId: string | null;
}

export interface IntacctPushSummary {
  pushed: number;
  failed: number;
  errors: string[];
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Sage Intacct Construction over its REST API (https://developer.sage.com/intacct). Auth is the
 * OAuth 2.0 authorization-code grant with scope offline_access, so a refresh token comes back;
 * access tokens last 12 hours. The Cantero app must be registered in the Sage App Registry to get
 * INTACCT_CLIENT_ID/SECRET — a business step, not something code can do — and the company must
 * authorize the sender (an admin approving the OAuth prompt does that).
 *
 * What's pushed is deliberately narrow, because the Intacct objects are:
 * - A project contract header (POST /objects/construction/project-contract) — name, project,
 *   customer, contract date. Contract *lines* carry billing setup and GL accounts Cantero has no
 *   equivalent for, so they're left to be completed in Intacct.
 * - Approved change orders as draft project change orders. totalCost/totalPrice are read-only in
 *   Intacct (derived from its own lines), so the Cantero amount can only go into the description.
 * Built from the published OpenAPI schema; not exercised against a live Intacct tenant (needs a
 * registered app and a sandbox company), so expect to adjust ID conventions on first real use.
 */
@Injectable()
export class IntacctService {
  private readonly logger = new Logger(IntacctService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  async getStatus(companyId: string) {
    const connection = await this.prisma.intacctConnection.findUnique({ where: { companyId } });
    if (!connection) return { connected: false as const };
    return { connected: true as const, connectedAt: connection.connectedAt, changeOrderItemId: connection.changeOrderItemId };
  }

  getAuthorizeUrl(companyId: string): string {
    const clientId = this.config.get<string>("INTACCT_CLIENT_ID");
    if (!clientId) throw new BadRequestException("Sage Intacct isn't configured on this server — set INTACCT_CLIENT_ID/INTACCT_CLIENT_SECRET");
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: this.callbackUrl(),
      state: this.jwt.sign({ companyId }, { expiresIn: STATE_TTL }),
      scope: "offline_access",
    });
    return `${this.baseUrl()}/oauth2/authorize?${params.toString()}`;
  }

  async handleCallback(code: string, state: string): Promise<{ companyId: string }> {
    let decoded: { companyId: string };
    try {
      decoded = this.jwt.verify(state);
    } catch {
      throw new BadRequestException("This connection link has expired — try connecting again");
    }
    const tokens = await this.tokenRequest({ grant_type: "authorization_code", code, redirect_uri: this.callbackUrl() });
    if (!tokens.refresh_token) throw new BadRequestException("Sage Intacct didn't return a refresh token — the connection can't stay authorized");

    const data = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    };
    await this.prisma.intacctConnection.upsert({ where: { companyId: decoded.companyId }, create: { companyId: decoded.companyId, ...data }, update: data });
    return { companyId: decoded.companyId };
  }

  async disconnect(companyId: string): Promise<void> {
    await this.prisma.intacctConnection.deleteMany({ where: { companyId } });
  }

  async updateSettings(companyId: string, changeOrderItemId: string | null) {
    await this.getConnectionOrThrow(companyId, false);
    return this.prisma.intacctConnection.update({ where: { companyId }, data: { changeOrderItemId: changeOrderItemId || null } });
  }

  /** Creates the project's contract in Intacct, once. The two Intacct IDs are typed in by the
   * user (nothing in Cantero can know them) and remembered on the project/client so the next
   * change-order push doesn't ask again. */
  async pushProjectContract(companyId: string, actor: AuditActor, projectId: string, input: PushIntacctContractInput) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId }, include: { client: true } });
    if (!project) throw new NotFoundException("Project not found");
    if (project.intacctContractId) throw new BadRequestException("This project's contract was already pushed to Sage Intacct");
    if (!project.clientId) throw new BadRequestException("This project has no client — a project contract needs a customer");

    const connection = await this.getConnectionOrThrow(companyId);
    const created = await this.request(connection, "POST", "/objects/construction/project-contract", {
      id: `PC-${project.id.slice(0, 8)}`,
      name: project.name.slice(0, 80),
      project: { id: input.intacctProjectId },
      customer: { id: input.intacctCustomerId },
      contractDate: isoDay(new Date()),
      description: `Created from Cantero project "${project.name}"`,
    });
    const contractId = created?.["ia::result"]?.id ?? created?.["ia::result"]?.key;
    if (!contractId) throw new BadRequestException("Sage Intacct accepted the request but returned no contract id");

    await this.prisma.$transaction([
      this.prisma.project.update({ where: { id: projectId }, data: { intacctProjectId: input.intacctProjectId, intacctContractId: String(contractId) } }),
      this.prisma.client.update({ where: { id: project.clientId }, data: { intacctCustomerId: input.intacctCustomerId } }),
    ]);
    this.audit.record(companyId, actor, "intacct.contract_pushed", "Project", projectId, `Pushed project "${project.name}" to Sage Intacct as contract ${contractId}`);
    return { contractId: String(contractId) };
  }

  /** Approved, not-yet-pushed change orders of one project, each as a draft project change order.
   * One failing doesn't stop the rest — same shape as MsProjectService.syncProject. */
  async pushChangeOrders(companyId: string, actor: AuditActor, projectId: string): Promise<IntacctPushSummary> {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");
    if (!project.intacctProjectId) throw new BadRequestException("Push the project's contract first, so Sage Intacct's project ID is known");

    const connection = await this.getConnectionOrThrow(companyId);
    if (!connection.changeOrderItemId) throw new BadRequestException("Set the Intacct item ID for change orders in Settings first — Intacct requires one");

    const orders = await this.prisma.changeOrder.findMany({
      where: { companyId, estimate: { projectId }, status: "approved", intacctChangeOrderId: null },
      orderBy: { number: "asc" },
    });
    const summary: IntacctPushSummary = { pushed: 0, failed: 0, errors: [] };
    for (const order of orders) {
      try {
        const day = isoDay(order.decisionAt ?? order.createdAt);
        const description = [order.title, order.description, `Cantero total: ${order.grandTotal.toString()}`].filter(Boolean).join(" — ");
        const created = await this.request(connection, "POST", "/objects/construction/project-change-order", {
          id: `CAN-${project.id.slice(0, 6)}-CO${order.number}`,
          project: { id: project.intacctProjectId },
          projectChangeOrderDate: day,
          priceEffectiveDate: day,
          item: { id: connection.changeOrderItemId },
          state: "draft",
          description: description.slice(0, 500),
        });
        const id = created?.["ia::result"]?.id ?? created?.["ia::result"]?.key;
        if (!id) throw new Error("no id returned");
        await this.prisma.changeOrder.update({ where: { id: order.id }, data: { intacctChangeOrderId: String(id) } });
        summary.pushed++;
      } catch (err) {
        const message = err instanceof Error ? err.message : "push failed";
        summary.failed++;
        summary.errors.push(`CO-${order.number}: ${message}`);
        this.logger.warn(`Intacct change order push failed for ${order.id}: ${message}`);
      }
    }
    if (summary.pushed > 0) this.audit.record(companyId, actor, "intacct.change_orders_pushed", "Project", projectId, `Pushed ${summary.pushed} change order(s) to Sage Intacct`);
    return summary;
  }

  private async getConnectionOrThrow(companyId: string, refresh = true): Promise<IntacctConnection> {
    const connection = await this.prisma.intacctConnection.findUnique({ where: { companyId } });
    if (!connection) throw new NotFoundException("No Sage Intacct account connected");
    return refresh ? this.ensureFreshToken(connection) : connection;
  }

  private async ensureFreshToken(connection: IntacctConnection): Promise<IntacctConnection> {
    if (connection.tokenExpiresAt.getTime() - Date.now() > 60_000) return connection;
    let tokens: TokenResponse;
    try {
      tokens = await this.tokenRequest({ grant_type: "refresh_token", refresh_token: connection.refreshToken });
    } catch {
      throw new BadRequestException("Failed to refresh the Sage Intacct connection — reconnect it in Settings");
    }
    return this.prisma.intacctConnection.update({
      where: { id: connection.id },
      data: {
        accessToken: tokens.access_token,
        ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      },
    });
  }

  private async tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
    const res = await fetch(`${this.baseUrl()}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        ...params,
        client_id: this.config.getOrThrow<string>("INTACCT_CLIENT_ID"),
        client_secret: this.config.getOrThrow<string>("INTACCT_CLIENT_SECRET"),
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new BadRequestException("Sage Intacct rejected the authorization request");
    return (await res.json()) as TokenResponse;
  }

  private async request(connection: IntacctConnection, method: "POST", path: string, body: unknown): Promise<any> {
    const res = await fetch(`${this.baseUrl()}${path}`, {
      method,
      headers: { Authorization: `Bearer ${connection.accessToken}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      let detail = "";
      try {
        const err = await res.json();
        detail = err?.["ia::result"]?.error?.message ?? err?.error?.message ?? err?.message ?? "";
      } catch {
        // non-JSON error body — the status alone will have to do
      }
      throw new Error(`Sage Intacct ${path} failed (${res.status})${detail ? `: ${detail}` : ""}`);
    }
    return res.json();
  }

  private baseUrl(): string {
    return this.config.get<string>("INTACCT_API_BASE_URL") ?? DEFAULT_BASE_URL;
  }

  private callbackUrl(): string {
    return `${this.config.get<string>("API_ORIGIN") ?? "http://localhost:4000/api"}/auth/intacct/callback`;
  }
}
