import * as Sentry from "@sentry/node";
import { WebhooksService } from "./webhooks.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

jest.mock("@sentry/node", () => ({ captureException: jest.fn() }));

const COMPANY_A = "company-a";

// trigger()/notifyChat() are fire-and-forget void methods — this flushes the microtask queue
// (and one macrotask tick) so their internal promise chains settle before assertions run.
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe("WebhooksService.trigger", () => {
  let service: WebhooksService;
  let prisma: {
    webhookEndpoint: { findMany: jest.Mock; update: jest.Mock };
    webhookDelivery: { create: jest.Mock };
    company: { findUnique: jest.Mock };
  };
  let originalFetch: typeof fetch;

  beforeEach(() => {
    prisma = {
      webhookEndpoint: { findMany: jest.fn(), update: jest.fn().mockResolvedValue({}) },
      webhookDelivery: { create: jest.fn().mockResolvedValue({}) },
      company: { findUnique: jest.fn().mockResolvedValue({ slackWebhookUrl: null, teamsWebhookUrl: null }) },
    };
    service = new WebhooksService(prisma as never, { record: jest.fn() } as unknown as AuditService);
    originalFetch = global.fetch;
    jest.clearAllMocks();
    prisma.webhookEndpoint.update.mockResolvedValue({});
    prisma.webhookDelivery.create.mockResolvedValue({});
    prisma.company.findUnique.mockResolvedValue({ slackWebhookUrl: null, teamsWebhookUrl: null });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("reports to Sentry when reading webhook endpoints from the database fails", async () => {
    prisma.webhookEndpoint.findMany.mockRejectedValue(new Error("connection refused"));

    service.trigger(COMPANY_A, "invoice.sent", {});
    await flush();

    expect(Sentry.captureException).toHaveBeenCalledWith(expect.objectContaining({ message: "connection refused" }));
  });

  it("reports to Sentry when recording a delivery attempt's outcome fails, even though the delivery itself succeeded", async () => {
    prisma.webhookEndpoint.findMany.mockResolvedValue([{ id: "ep-1", url: "https://example.com/hook", secret: "s3cr3t" }]);
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as never;
    prisma.webhookDelivery.create.mockRejectedValue(new Error("db write failed"));

    service.trigger(COMPANY_A, "invoice.sent", {});
    await flush();
    await flush();

    expect(Sentry.captureException).toHaveBeenCalledWith(expect.objectContaining({ message: "db write failed" }));
  });

  it("does NOT report to Sentry when the actual HTTP delivery to the customer's endpoint fails — that's an expected, already-tracked outcome", async () => {
    prisma.webhookEndpoint.findMany.mockResolvedValue([{ id: "ep-1", url: "https://example.com/hook", secret: "s3cr3t" }]);
    global.fetch = jest.fn().mockRejectedValue(new Error("ECONNREFUSED")) as never;

    service.trigger(COMPANY_A, "invoice.sent", {});
    await flush();
    await flush();

    expect(Sentry.captureException).not.toHaveBeenCalled();
    // The failure is still recorded for the customer to see in their own delivery log.
    expect(prisma.webhookDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ success: false, error: "ECONNREFUSED" }) }),
    );
  });

  it("reports to Sentry when notifyChat's own database read fails", async () => {
    prisma.webhookEndpoint.findMany.mockResolvedValue([]);
    prisma.company.findUnique.mockRejectedValue(new Error("connection refused"));

    service.trigger(COMPANY_A, "invoice.sent", {});
    await flush();

    expect(Sentry.captureException).toHaveBeenCalledWith(expect.objectContaining({ message: "connection refused" }));
  });

  it("does NOT report to Sentry when a configured chat webhook (Slack/Teams) itself fails to deliver", async () => {
    prisma.webhookEndpoint.findMany.mockResolvedValue([]);
    prisma.company.findUnique.mockResolvedValue({ slackWebhookUrl: "https://hooks.slack.com/services/x", teamsWebhookUrl: null });
    global.fetch = jest.fn().mockRejectedValue(new Error("ECONNREFUSED")) as never;

    service.trigger(COMPANY_A, "invoice.sent", {});
    await flush();
    await flush();

    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});
