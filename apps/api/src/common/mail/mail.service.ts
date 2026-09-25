import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";
import type { SafeHtml } from "./html";

export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface MailMessage {
  to: string;
  subject: string;
  /** Build it with html`` (./html.ts) so interpolated values are escaped. */
  html: string | SafeHtml;
  text: string;
  attachments?: MailAttachment[];
}

/**
 * Sends transactional email over SMTP. If SMTP_HOST isn't configured (local dev by
 * default), messages are logged instead of sent — lets invite/estimate/invoice flows
 * be exercised end-to-end without a real mailbox. Never throws: a broken mail provider
 * shouldn't break the business action (invite creation, estimate/invoice send) it rides on.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter | null;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    this.from = this.config.get<string>("SMTP_FROM") ?? "Cantero <no-reply@cantero.dev>";
    const host = this.config.get<string>("SMTP_HOST");
    this.transporter = host
      ? nodemailer.createTransport({
          host,
          port: Number(this.config.get<string>("SMTP_PORT") ?? 587),
          secure: this.config.get<string>("SMTP_SECURE") === "true",
          auth: this.config.get<string>("SMTP_USER")
            ? { user: this.config.get<string>("SMTP_USER"), pass: this.config.get<string>("SMTP_PASSWORD") }
            : undefined,
        })
      : null;
  }

  async send(message: MailMessage): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(
        `SMTP_HOST not configured — logging email instead of sending.\nTo: ${message.to}\nSubject: ${message.subject}\n${message.text}`,
      );
      return;
    }
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: message.to,
        subject: message.subject,
        html: String(message.html),
        text: message.text,
        attachments: message.attachments,
      });
    } catch (err) {
      this.logger.error(`Failed to send email to ${message.to}: ${(err as Error).message}`);
    }
  }
}
