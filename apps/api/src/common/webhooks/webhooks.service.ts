import { createHmac, randomBytes } from "node:crypto";
import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreateWebhookEndpointInput, UpdateWebhookEndpointInput, WebhookEvent } from "@cantero/shared";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService, type AuditActor } from "../audit/audit.service";
import { assertPublicWebhookUrl } from "./webhook-url";

const DELIVERY_TIMEOUT_MS = 8000;

@Injectable()
export class WebhooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

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
      data: { companyId, url: input.url, events: input.events, secret },
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
    await this.prisma.webhookEndpoint.update({ where: { id }, data: { secret } });
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
   * endpoint being unreachable) must never break the business action that triggered it.
   */
  trigger(companyId: string, event: WebhookEvent, payload: Record<string, unknown>): void {
    this.prisma.webhookEndpoint
      .findMany({ where: { companyId, active: true, events: { has: event } } })
      .then((endpoints) => {
        for (const endpoint of endpoints) {
          this.deliver(endpoint.id, endpoint.url, endpoint.secret, event, payload).catch(() => {});
        }
      })
      .catch(() => {});
  }

  private async deliver(
    endpointId: string,
    url: string,
    secret: string,
    event: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const body = JSON.stringify({ event, data: payload, timestamp: new Date().toISOString() });
    const signature = createHmac("sha256", secret).update(body).digest("hex");

    let success = false;
    let statusCode: number | undefined;
    let error: string | undefined;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Cantero-Event": event, "X-Cantero-Signature": signature },
          body,
          signal: controller.signal,
        });
        statusCode = res.status;
        success = res.ok;
        if (!success) error = `HTTP ${res.status}`;
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "Delivery failed";
    }

    await this.prisma.webhookEndpoint
      .update({ where: { id: endpointId }, data: { lastDeliveryAt: new Date(), lastDeliveryStatus: success ? "success" : "failed" } })
      .catch(() => {});
    await this.prisma.webhookDelivery.create({ data: { webhookEndpointId: endpointId, event, success, statusCode, error } }).catch(() => {});
  }
}
