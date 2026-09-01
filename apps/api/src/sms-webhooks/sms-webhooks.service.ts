import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Twilio from "twilio";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";
import { smsTemplates } from "../common/sms/sms-templates";
import { TasksService } from "../projects/tasks.service";
import { parseStatusReply } from "./parse-status-reply";

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/**
 * Inbound half of the worker-SMS loop — the outbound half (SmsService/smsTemplates.taskAssigned)
 * already exists. A worker replying "done"/"started" (in any of the 5 launch locales, matched as
 * a substring so natural phrasing works) updates their most recently assigned task's status via
 * the same TasksService.update() a human would use, so cascadeShift and everything else downstream
 * of a status change behaves identically. There's exactly one Twilio number for the whole
 * platform (see SmsService), so a reply is matched to a worker by phone number alone, not scoped
 * to any one company — the same cross-tenant simplification the single shared number already
 * implies for the outbound side.
 */
@Injectable()
export class SmsWebhooksService {
  private readonly logger = new Logger(SmsWebhooksService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tasks: TasksService,
  ) {}

  /** No TWILIO_AUTH_TOKEN configured (local dev by default) skips validation entirely — same
   * graceful-degrade SmsService itself uses when Twilio isn't set up. */
  validateSignature(signature: string | undefined, url: string, params: Record<string, unknown>): boolean {
    const authToken = this.config.get<string>("TWILIO_AUTH_TOKEN");
    if (!authToken) return true;
    if (!signature) return false;
    return Twilio.validateRequest(authToken, signature, url, params);
  }

  async handleInbound(from: string, body: string): Promise<string> {
    const worker = await this.prisma.worker.findFirst({ where: { phone: from.trim(), active: true } });
    if (!worker) {
      this.logger.debug(`Inbound SMS from unrecognized number — ignored`);
      return this.twiml();
    }

    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: worker.companyId } });
    const locale = worker.preferredLocale ?? company.locale;

    const statusReply = parseStatusReply(locale, body);
    if (!statusReply) return this.twiml(smsTemplates.taskStatusNotUnderstood(locale));

    const assignment = await this.prisma.resourceAssignment.findFirst({
      where: { workerId: worker.id, taskId: { not: null } },
      orderBy: { createdAt: "desc" },
      include: { task: true },
    });
    if (!assignment?.task) return this.twiml(smsTemplates.taskStatusNoTask(locale));

    await this.tasks.update(worker.companyId, assignment.task.id, { status: statusReply });
    this.audit.record(
      worker.companyId,
      { name: `${worker.name} (SMS)` },
      "task.status_updated_via_sms",
      "Task",
      assignment.task.id,
      `Worker texted "${body}" — task marked ${statusReply.replace("_", " ")}`,
    );

    return this.twiml(smsTemplates.taskStatusConfirmed(locale, assignment.task.name, statusReply));
  }

  private twiml(message?: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?><Response>${message ? `<Message>${escapeXml(message)}</Message>` : ""}</Response>`;
  }
}
