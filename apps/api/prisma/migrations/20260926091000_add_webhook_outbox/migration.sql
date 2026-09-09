-- Transactional outbox for webhook delivery (AUDIT-2026-09-07.md, "Доставка интеграций
-- ненадёжна"). Callers write an OutboxEvent row in the same prisma.$transaction() as the
-- business event that triggers it, so a process crash after commit still leaves a durable
-- pending row for the OutboxProcessor to pick up and deliver with retry/backoff — instead of
-- WebhooksService.trigger()'s current fire-and-forget, which loses the event entirely on crash.

CREATE TYPE "OutboxEventStatus" AS ENUM ('pending', 'processing', 'delivered', 'failed');

CREATE TABLE "outbox_events" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxEventStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "outbox_events_status_nextAttemptAt_idx" ON "outbox_events"("status", "nextAttemptAt");
CREATE INDEX "outbox_events_companyId_createdAt_idx" ON "outbox_events"("companyId", "createdAt");

ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Links a delivery-log row back to the outbox event that produced it (null for pre-existing
-- rows and for notifyChat/Slack deliveries, which aren't outbox-backed) — paired with
-- webhookEndpointId in a unique constraint so a retried outbox job can tell it already
-- delivered to a given endpoint and skip re-sending instead of double-posting.
ALTER TABLE "webhook_deliveries" ADD COLUMN "outboxEventId" TEXT;

CREATE UNIQUE INDEX "webhook_deliveries_outboxEventId_webhookEndpointId_key"
  ON "webhook_deliveries"("outboxEventId", "webhookEndpointId");

ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_outboxEventId_fkey"
  FOREIGN KEY ("outboxEventId") REFERENCES "outbox_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
