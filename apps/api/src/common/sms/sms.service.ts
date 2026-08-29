import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Twilio from "twilio";

export interface SmsMessage {
  to: string;
  body: string;
}

/**
 * Sends transactional SMS over Twilio. If TWILIO_ACCOUNT_SID isn't configured (local dev by
 * default), messages are logged instead of sent — same graceful-degrade as MailService without
 * SMTP_HOST, so worker-assignment/safety-briefing flows can be exercised end-to-end without a
 * real Twilio account. Never throws: a broken SMS provider shouldn't break the business action
 * (assigning a worker to a task, logging a safety briefing) it rides on.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly client: ReturnType<typeof Twilio> | null;
  private readonly from: string | undefined;

  constructor(private readonly config: ConfigService) {
    const accountSid = this.config.get<string>("TWILIO_ACCOUNT_SID");
    const authToken = this.config.get<string>("TWILIO_AUTH_TOKEN");
    this.from = this.config.get<string>("TWILIO_FROM_NUMBER");
    this.client = accountSid && authToken ? Twilio(accountSid, authToken) : null;
  }

  async send(message: SmsMessage): Promise<void> {
    if (!this.client || !this.from) {
      this.logger.warn(`TWILIO_ACCOUNT_SID not configured — logging SMS instead of sending.\nTo: ${message.to}\n${message.body}`);
      return;
    }
    try {
      await this.client.messages.create({ to: message.to, from: this.from, body: message.body });
    } catch (err) {
      this.logger.error(`Failed to send SMS to ${message.to}: ${(err as Error).message}`);
    }
  }
}
