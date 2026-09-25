import { createHmac, randomBytes } from "node:crypto";
import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import * as Sentry from "@sentry/node";
import { WEBHOOK_EVENTS, type CreateWebhookEndpointInput, type UpdateWebhookEndpointInput, type WebhookEvent } from "@cantero/shared";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService, type AuditActor } from "../audit/audit.service";
import { assertPublicWebhookUrl, resolvePinnedWebhookDispatcher } from "./webhook-url";
import { decryptSecret, encryptSecret } from "../crypto/secret-box";

const DELIVERY_TIMEOUT_MS = 8000;

const eventLabel = (event: string) => event.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Every event name available to subscribe to, for a Zapier/Make setup screen or similar —
   * the delivery envelope itself is always `{ event, data, timestamp }`, HMAC-SHA256-signed over
   * the JSON body in the X-Cantero-Signature header (secret shown once at endpoint creation). */
  catalog() {
    return WEBHOOK_EVENTS.map((event) => ({ event, label: eventLabel(event) }));
  }

  list(companyId: string) {
    return this.prisma.webhookEndpoint.findMany({
      where: { companyId },
      select: {
        id: true,
        url: true,
        events: true,
        active: true,
        createdAt: true,
        lastDeliveryAt: true,
        lastDeliveryStatus: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  listDeliveries(companyId: string, endpointId: string, take = 20) {
    return this.prisma.webhookDelivery.findMany({
      where: { webhookEndpointId: endpointId, endpoint: { companyId } },
      orderBy: { createdAt: "desc" },
      take,
    });
  }

  /** The raw secret is returned only here, at creation — used to sign every future delivery, so unlike an API key it stays stored (not hashed). */
  async create(companyId: string, actor: AuditActor, input: CreateWebhookEndpointInput) {
    await assertPublicWebhookUrl(input.url);
    const secret = randomBytes(24).toString("hex");
    const endpoint = await this.prisma.webhookEndpoint.create({
      data: { companyId, url: input.url, events: input.events, secret: encryptSecret(secret) },
    });
    this.audit.record(companyId, actor, "webhook.created", "WebhookEndpoint", endpoint.id, `Created webhook for ${input.url}`);
    return { ...endpoint, secret };
  }

  async update(companyId: string, actor: AuditActor, id: string, input: UpdateWebhookEndpointInput) {
    const endpoint = await this.prisma.webhookEndpoint.findFirst({ where: { id, companyId } });
    if (!endpoint) throw new NotFoundException("Webhook not found");
    const updated = await this.prisma.webhookEndpoint.update({
      where: { id },
      data: { events: input.events, active: input.active },
    });
    this.audit.record(companyId, actor, "webhook.updated", "WebhookEndpoint", id, `Updated webhook for ${endpoint.url}`);
    return updated;
  }

  async regenerateSecret(companyId: string, actor: AuditActor, id: string) {
    const endpoint = await this.prisma.webhookEndpoint.findFirst({ where: { id, companyId } });
    if (!endpoint) throw new NotFoundException("Webhook not found");
    const secret = randomBytes(24).toString("hex");
    await this.prisma.webhookEndpoint.update({ where: { id }, data: { secret: encryptSecret(secret) } });
    this.audit.record(companyId, actor, "webhook.secret_regenerated", "WebhookEndpoint", id, `Regenerated secret for webhook ${endpoint.url}`);
    return { secret };
  }

  async delete(companyId: string, actor: AuditActor, id: string) {
    const endpoint = await this.prisma.webhookEndpoint.findFirst({ where: { id, companyId } });
    if (!endpoint) throw new NotFoundException("Webhook not found");
    await this.prisma.webhookEndpoint.delete({ where: { id } });
    this.audit.record(companyId, actor, "webhook.deleted", "WebhookEndpoint", id, `Deleted webhook for ${endpoint.url}`);
    return { ok: true };
  }

  /**
   * Fire-and-forget, same contract as AuditService.record(): a delivery failing (or every
   * endpoint being unreachable) must never break the business action that triggered it. These
   * outer catches only ever see OUR OWN bugs/infra failures (a DB read/write breaking, or
   * something throwing before an HTTP attempt is even made) — an actual delivery attempt to a
   * customer's endpoint or chat webhook failing is a normal, expected outcome (their endpoint can
   * be down/misconfigured) already handled inside deliver()/notifyChat() via a DB status record
   * or a warn log, not something worth an alert. So report here, not there.
   */
  trigger(companyId: string, event: WebhookEvent, payload: Record<string, unknown>): void {
    this.prisma.webhookEndpoint
      .findMany({ where: { companyId, active: true, events: { has: event } } })
      .then((endpoints) => {
        for (const endpoint of endpoints) {
          this.deliverToEndpoint(endpoint, event, payload).catch((err) => Sentry.captureException(err));
        }
      })
      .catch((err) => Sentry.captureException(err));

    this.notifyChat(companyId, event, payload).catch((err) => Sentry.captureException(err));
  }

  /** Posts the same event that just fired to whichever chat webhooks the company has
   * configured — same simple `{"text": "..."}` payload shape both Slack and (legacy) Microsoft
   * Teams incoming webhooks accept, so one formatter covers both without per-provider branching. */
  async notifyChat(companyId: string, event: WebhookEvent, payload: Record<string, unknown>): Promise<void> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { slackWebhookUrl: true, teamsWebhookUrl: true },
    });
    if (!company?.slackWebhookUrl && !company?.teamsWebhookUrl) return;

    const detail = Object.entries(payload)
      .slice(0, 4)
      .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
      .join(", ");
    const text = `*Cantero* — ${eventLabel(event)}${detail ? `\n${detail}` : ""}`;

    for (const url of [company.slackWebhookUrl, company.teamsWebhookUrl].filter((u): u is string => !!u)) {
      // redirect: "manual" — the URL was validated as public/non-private at save time, but a
      // 3xx response could otherwise point this request at an internal address at delivery time
      // without ever being re-checked. Not following it closes that gap; Slack/Teams endpoints
      // don't redirect in normal operation anyway. dispatcher pins the connection to a freshly
      // (re-)resolved, re-validated IP — see resolvePinnedWebhookDispatcher's doc comment for why
      // that's needed on top of redirect: "manual" (DNS rebinding, not a redirect).
      resolvePinnedWebhookDispatcher(url)
        .then((dispatcher) =>
          fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
            redirect: "manual",
            dispatcher,
          } as RequestInit),
        )
        .catch((err) => this.logger.warn(`Chat webhook delivery failed for company ${companyId}: ${(err as Error).message}`));
    }
  }

  /** Delivers one event to one endpoint and records the outcome. Shared by the legacy
   * fire-and-forget trigger() path and OutboxProcessor's durable-retry path — outboxEventId is
   * set only for the latter, so a retried delivery can be told apart from a fresh one (see the
   * unique constraint on WebhookDelivery(outboxEventId, webhookEndpointId)). Returns whether the
   * delivery succeeded so the outbox processor can decide whether to retry. */
  async deliverToEndpoint(
    endpoint: { id: string; url: string; secret: string },
    event: string,
    payload: Record<string, unknown>,
    outboxEventId?: string,
  ): Promise<boolean> {
    const { id: endpointId, url, secret } = endpoint;
    const body = JSON.stringify({ event, data: payload, timestamp: new Date().toISOString() });
    const signature = createHmac("sha256", decryptSecret(secret)).update(body).digest("hex");

    let success = false;
    let statusCode: number | undefined;
    let error: string | undefined;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
      try {
        // dispatcher pins this request to a freshly (re-)resolved, re-validated IP — closes the
        // DNS-rebinding gap that redirect: "manual" alone doesn't (see
        // resolvePinnedWebhookDispatcher's doc comment). Thrown here (private/unresolvable
        // address) falls into the outer catch below, same as any other delivery failure.
        const dispatcher = await resolvePinnedWebhookDispatcher(url);
        // redirect: "manual" — assertPublicWebhookUrl only checks the URL at save time; without
        // this, a since-compromised (or maliciously registered) endpoint could answer with a 3xx
        // pointing at a private/internal address and this request would follow it there,
        // bypassing that check entirely on every future delivery.
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Cantero-Event": event, "X-Cantero-Signature": signature },
          body,
          signal: controller.signal,
          redirect: "manual",
          dispatcher,
        } as RequestInit);
        if (res.type === "opaqueredirect") {
          success = false;
          error = "Endpoint responded with a redirect — redirects are not followed for webhook deliveries";
        } else {
          statusCode = res.status;
          success = res.ok;
          if (!success) error = `HTTP ${res.status}`;
        }
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "Delivery failed";
    }

    await this.prisma.webhookEndpoint
      .update({ where: { id: endpointId }, data: { lastDeliveryAt: new Date(), lastDeliveryStatus: success ? "success" : "failed" } })
      .catch((err) => Sentry.captureException(err));

    // Outbox path: one WebhookDelivery row per (outboxEvent, endpoint) — a retry updates the same
    // row's outcome rather than inserting a second one (which the unique constraint would reject
    // anyway). Legacy trigger() path (outboxEventId undefined -> stored as NULL) keeps inserting a
    // fresh log row per attempt, since NULLs don't collide against the unique index.
    if (outboxEventId) {
      await this.prisma.webhookDelivery
        .upsert({
          where: { outboxEventId_webhookEndpointId: { outboxEventId, webhookEndpointId: endpointId } },
          create: { webhookEndpointId: endpointId, outboxEventId, event, success, statusCode, error },
          update: { success, statusCode, error, createdAt: new Date() },
        })
        .catch((err) => Sentry.captureException(err));
    } else {
      await this.prisma.webhookDelivery
        .create({ data: { webhookEndpointId: endpointId, event, success, statusCode, error } })
        .catch((err) => Sentry.captureException(err));
    }

    return success;
  }

  /** Endpoints currently subscribed to an event, for OutboxProcessor to fan an outbox row out to. */
  findActiveEndpoints(companyId: string, event: string) {
    return this.prisma.webhookEndpoint.findMany({ where: { companyId, active: true, events: { has: event } } });
  }

  /** Whether this outbox event was already successfully delivered to this endpoint on a prior
   * processing pass — lets a retry skip endpoints that already succeeded while still retrying
   * ones that previously failed (which have a WebhookDelivery row too, just with success: false). */
  async alreadyDelivered(outboxEventId: string, webhookEndpointId: string): Promise<boolean> {
    const existing = await this.prisma.webhookDelivery.findUnique({
      where: { outboxEventId_webhookEndpointId: { outboxEventId, webhookEndpointId } },
    });
    return existing?.success === true;
  }
}
