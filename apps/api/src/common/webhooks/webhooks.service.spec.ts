import * as Sentry from "@sentry/node";
import { WebhooksService } from "./webhooks.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { resolvePinnedWebhookDispatcher } from "./webhook-url";

jest.mock("@sentry/node", () => ({ captureException: jest.fn() }));
// Delivery now resolves a real (pinned) dispatcher before every fetch — see
// resolvePinnedWebhookDispatcher's own spec file for its DNS/private-IP behavior. Mocked here so
// these tests can keep asserting on a mocked global.fetch without a real DNS lookup in between.
jest.mock("./webhook-url", () => ({
  ...jest.requireActual("./webhook-url"),
  resolvePinnedWebhookDispatcher: jest.fn(),
}));

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
    (resolvePinnedWebhookDispatcher as jest.Mock).mockResolvedValue({ __fakeDispatcher: true });
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

  it("does not follow a redirect from a customer endpoint — recorded as a failed delivery instead", async () => {
    // Without this, an endpoint that was public when registered could later (or immediately, if
    // malicious) answer with a 3xx pointing at a private/internal address, and a plain fetch()
    // would follow it there — bypassing assertPublicWebhookUrl's save-time check entirely.
    prisma.webhookEndpoint.findMany.mockResolvedValue([{ id: "ep-1", url: "https://example.com/hook", secret: "s3cr3t" }]);
    const fetchMock = jest.fn().mockResolvedValue({ type: "opaqueredirect", ok: false, status: 0 });
    global.fetch = fetchMock as never;

    service.trigger(COMPANY_A, "invoice.sent", {});
    await flush();
    await flush();

    expect(fetchMock).toHaveBeenCalledWith("https://example.com/hook", expect.objectContaining({ redirect: "manual" }));
    expect(prisma.webhookDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ success: false, error: expect.stringContaining("redirect") }) }),
    );
  });

  it("does not follow a redirect from a chat (Slack/Teams) webhook either", async () => {
    prisma.webhookEndpoint.findMany.mockResolvedValue([]);
    prisma.company.findUnique.mockResolvedValue({ slackWebhookUrl: "https://hooks.slack.com/services/x", teamsWebhookUrl: null });
    const fetchMock = jest.fn().mockResolvedValue({ type: "opaqueredirect", ok: false, status: 0 });
    global.fetch = fetchMock as never;

    service.trigger(COMPANY_A, "invoice.sent", {});
    await flush();

    expect(fetchMock).toHaveBeenCalledWith("https://hooks.slack.com/services/x", expect.objectContaining({ redirect: "manual" }));
  });

  it("pins the customer-endpoint delivery to the dispatcher resolvePinnedWebhookDispatcher returns", async () => {
    prisma.webhookEndpoint.findMany.mockResolvedValue([{ id: "ep-1", url: "https://example.com/hook", secret: "s3cr3t" }]);
    const fakeDispatcher = { __fakeDispatcher: "pinned" };
    (resolvePinnedWebhookDispatcher as jest.Mock).mockResolvedValue(fakeDispatcher);
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock as never;

    service.trigger(COMPANY_A, "invoice.sent", {});
    await flush();
    await flush();

    expect(resolvePinnedWebhookDispatcher).toHaveBeenCalledWith("https://example.com/hook");
    expect(fetchMock).toHaveBeenCalledWith("https://example.com/hook", expect.objectContaining({ dispatcher: fakeDispatcher }));
  });

  it("records a failed delivery (without ever calling fetch) when the pinned resolution rejects — e.g. the hostname rebound to a private address since registration", async () => {
    prisma.webhookEndpoint.findMany.mockResolvedValue([{ id: "ep-1", url: "https://example.com/hook", secret: "s3cr3t" }]);
    (resolvePinnedWebhookDispatcher as jest.Mock).mockRejectedValue(
      new Error("Webhook destination resolved to a private or internal address"),
    );
    const fetchMock = jest.fn();
    global.fetch = fetchMock as never;

    service.trigger(COMPANY_A, "invoice.sent", {});
    await flush();
    await flush();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(prisma.webhookDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ success: false, error: expect.stringContaining("private or internal") }) }),
    );
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("skips a chat webhook delivery when the pinned resolution rejects, without calling fetch", async () => {
    prisma.webhookEndpoint.findMany.mockResolvedValue([]);
    prisma.company.findUnique.mockResolvedValue({ slackWebhookUrl: "https://hooks.slack.com/services/x", teamsWebhookUrl: null });
    (resolvePinnedWebhookDispatcher as jest.Mock).mockRejectedValue(new Error("Could not resolve the webhook host"));
    const fetchMock = jest.fn();
    global.fetch = fetchMock as never;

    service.trigger(COMPANY_A, "invoice.sent", {});
    await flush();
    await flush();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});
