import { Global, Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { ConfigModule, ConfigService } from "@nestjs/config";
import IORedis from "ioredis";

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
    BullModule.registerQueue({ name: STOCK_ALERTS_QUEUE }),
    BullModule.registerQueue({ name: PUSH_CHECK_QUEUE }),
    BullModule.registerQueue({ name: RECURRING_INVOICES_QUEUE }),
    BullModule.registerQueue({ name: SCHEDULED_REPORTS_QUEUE }),
    BullModule.registerQueue({ name: SLA_ESCALATION_QUEUE }),
    BullModule.registerQueue({ name: EQUIPMENT_MAINTENANCE_QUEUE }),
    BullModule.registerQueue({ name: NOTIFICATION_DIGEST_QUEUE }),
    BullModule.registerQueue({ name: INVOICE_REMINDERS_QUEUE }),
    BullModule.registerQueue({ name: SERVICE_VISIT_REMINDERS_QUEUE }),
    BullModule.registerQueue({ name: LEAD_FOLLOW_UP_QUEUE }),
    BullModule.registerQueue({ name: ESTIMATE_REMINDERS_QUEUE }),
    BullModule.registerQueue({ name: PERMIT_EXPIRING_QUEUE }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
