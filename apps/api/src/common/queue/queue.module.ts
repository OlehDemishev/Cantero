import { Global, Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { ConfigModule, ConfigService } from "@nestjs/config";
import IORedis from "ioredis";
import { QueueFailureReporterService } from "./queue-failure-reporter.service";

export const STOCK_ALERTS_QUEUE = "stock-alerts";
export const PUSH_CHECK_QUEUE = "push-check";
export const RECURRING_INVOICES_QUEUE = "recurring-invoices";
export const SCHEDULED_REPORTS_QUEUE = "scheduled-reports";
export const SLA_ESCALATION_QUEUE = "sla-escalation";
export const EQUIPMENT_MAINTENANCE_QUEUE = "equipment-maintenance";
export const NOTIFICATION_DIGEST_QUEUE = "notification-digest";
export const INVOICE_REMINDERS_QUEUE = "invoice-reminders";
export const SERVICE_VISIT_REMINDERS_QUEUE = "service-visit-reminders";
export const LEAD_FOLLOW_UP_QUEUE = "lead-follow-up";
export const ESTIMATE_REMINDERS_QUEUE = "estimate-reminders";
export const PERMIT_EXPIRING_QUEUE = "permit-expiring";
export const CHANGE_ORDER_REMINDERS_QUEUE = "change-order-reminders";
export const ENPS_SURVEYS_QUEUE = "enps-surveys";
export const OUTBOX_QUEUE = "webhook-outbox";
export const STOCK_LOT_EXPIRING_QUEUE = "stock-lot-expiring";
export const DOCUSIGN_POLL_QUEUE = "docusign-poll";
export const SEMANTIC_INDEX_QUEUE = "semantic-index";
export const DRAWING_SETS_QUEUE = "drawing-sets";

/** Every queue, in one list: each is registered below and watched for failures by
 * QueueFailureReporterService, so a new queue can't be added without its failures being reported. */
export const QUEUE_NAMES = [
  STOCK_ALERTS_QUEUE,
  PUSH_CHECK_QUEUE,
  RECURRING_INVOICES_QUEUE,
  SCHEDULED_REPORTS_QUEUE,
  SLA_ESCALATION_QUEUE,
  EQUIPMENT_MAINTENANCE_QUEUE,
  NOTIFICATION_DIGEST_QUEUE,
  INVOICE_REMINDERS_QUEUE,
  SERVICE_VISIT_REMINDERS_QUEUE,
  LEAD_FOLLOW_UP_QUEUE,
  ESTIMATE_REMINDERS_QUEUE,
  PERMIT_EXPIRING_QUEUE,
  CHANGE_ORDER_REMINDERS_QUEUE,
  ENPS_SURVEYS_QUEUE,
  OUTBOX_QUEUE,
  STOCK_LOT_EXPIRING_QUEUE,
  DOCUSIGN_POLL_QUEUE,
  SEMANTIC_INDEX_QUEUE,
  DRAWING_SETS_QUEUE,
] as const;

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // BullMQ requires maxRetriesPerRequest: null on the connection it uses for blocking commands.
        connection: new IORedis(config.getOrThrow<string>("REDIS_URL"), { maxRetriesPerRequest: null }),
      }),
    }),
    ...QUEUE_NAMES.map((name) => BullModule.registerQueue({ name })),
  ],
  providers: [QueueFailureReporterService],
  exports: [BullModule],
})
export class QueueModule {}
