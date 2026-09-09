import { OutboxProcessor } from "./outbox.processor";
import { WebhooksService } from "./webhooks.service";
import { PrismaService } from "../prisma/prisma.service";
import type { OutboxEvent } from "@prisma/client";

const COMPANY_A = "company-a";
const ENDPOINT_A = { id: "ep-1", url: "https://example.com/hook", secret: "s3cr3t" };

function makeOutboxEvent(overrides: Partial<OutboxEvent> = {}): OutboxEvent {
  return {
    id: "outbox-1",
    companyId: COMPANY_A,
    event: "invoice.sent",
    payload: { invoiceId: "inv-1" },
    status: "processing",
    attempts: 0,
    lastError: null,
    nextAttemptAt: new Date(),
    createdAt: new Date(),
    deliveredAt: null,
    ...overrides,
  } as OutboxEvent;
}

describe("OutboxProcessor", () => {
  let processor: OutboxProcessor;
  let prisma: {
    outboxEvent: { findMany: jest.Mock; updateMany: jest.Mock; update: jest.Mock };
  };
  let webhooks: {
    findActiveEndpoints: jest.Mock;
    alreadyDelivered: jest.Mock;
    deliverToEndpoint: jest.Mock;
    notifyChat: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      outboxEvent: {
        findMany: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    webhooks = {
      findActiveEndpoints: jest.fn().mockResolvedValue([ENDPOINT_A]),
      alreadyDelivered: jest.fn().mockResolvedValue(false),
      deliverToEndpoint: jest.fn().mockResolvedValue(true),
      notifyChat: jest.fn().mockResolvedValue(undefined),
    };
    processor = new OutboxProcessor(prisma as unknown as PrismaService, webhooks as unknown as WebhooksService);
  });

  it("marks the row delivered after every endpoint succeeds", async () => {
    const row = makeOutboxEvent();
    await (processor as unknown as { processOne(r: OutboxEvent): Promise<void> }).processOne(row);

    expect(prisma.outboxEvent.updateMany).toHaveBeenCalledWith({
      where: { id: row.id, status: "pending" },
      data: { status: "processing" },
    });
    expect(webhooks.deliverToEndpoint).toHaveBeenCalledWith(ENDPOINT_A, row.event, row.payload, row.id);
    expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: row.id },
      data: { status: "delivered", deliveredAt: expect.any(Date) },
    });
  });

  it("re-schedules with backoff when a delivery fails, instead of marking it failed immediately", async () => {
    webhooks.deliverToEndpoint.mockResolvedValue(false);
    const row = makeOutboxEvent({ attempts: 0 });

    await (processor as unknown as { processOne(r: OutboxEvent): Promise<void> }).processOne(row);

    expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: row.id },
      data: { status: "pending", attempts: { increment: 1 }, nextAttemptAt: expect.any(Date) },
    });
  });

  it("gives up and marks the row failed once max attempts are exhausted", async () => {
    webhooks.deliverToEndpoint.mockResolvedValue(false);
    const row = makeOutboxEvent({ attempts: 9 }); // MAX_ATTEMPTS = 10, so attempts+1 = 10 is not < 10

    await (processor as unknown as { processOne(r: OutboxEvent): Promise<void> }).processOne(row);

    expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: row.id },
      data: { status: "failed", deliveredAt: null },
    });
  });

  it("skips an endpoint that already succeeded on a prior attempt — idempotency", async () => {
    webhooks.alreadyDelivered.mockResolvedValue(true);
    const row = makeOutboxEvent({ attempts: 1 });

    await (processor as unknown as { processOne(r: OutboxEvent): Promise<void> }).processOne(row);

    expect(webhooks.deliverToEndpoint).not.toHaveBeenCalled();
    // Nothing failed this pass (the one endpoint was already done), so it's marked delivered.
    expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: row.id },
      data: { status: "delivered", deliveredAt: expect.any(Date) },
    });
  });

  it("does not claim (or process) a row another worker already claimed", async () => {
    prisma.outboxEvent.updateMany.mockResolvedValue({ count: 0 });
    const row = makeOutboxEvent();

    await (processor as unknown as { processOne(r: OutboxEvent): Promise<void> }).processOne(row);

    expect(webhooks.findActiveEndpoints).not.toHaveBeenCalled();
    expect(prisma.outboxEvent.update).not.toHaveBeenCalled();
  });

  it("sends the chat notification only on the first attempt, not on retries", async () => {
    const firstAttempt = makeOutboxEvent({ attempts: 0 });
    await (processor as unknown as { processOne(r: OutboxEvent): Promise<void> }).processOne(firstAttempt);
    expect(webhooks.notifyChat).toHaveBeenCalledTimes(1);

    webhooks.notifyChat.mockClear();
    const retry = makeOutboxEvent({ attempts: 2 });
    await (processor as unknown as { processOne(r: OutboxEvent): Promise<void> }).processOne(retry);
    expect(webhooks.notifyChat).not.toHaveBeenCalled();
  });
});
