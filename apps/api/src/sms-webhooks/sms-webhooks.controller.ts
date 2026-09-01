import { BadRequestException, Body, Controller, Header, Headers, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { Public } from "../common/decorators/public.decorator";
import { SmsWebhooksService } from "./sms-webhooks.service";

/** Unauthenticated — reached only by Twilio's own servers POSTing to this URL, verified via the
 * X-Twilio-Signature header (see SmsWebhooksService.validateSignature) rather than a bearer
 * token, same as the Stripe webhook's HMAC check in BillingController. */
@Controller("webhooks/sms")
export class SmsWebhooksController {
  constructor(private readonly service: SmsWebhooksService) {}

  @Public()
  @Post("inbound")
  @Header("Content-Type", "text/xml")
  async inbound(@Req() req: Request, @Headers("x-twilio-signature") signature: string | undefined, @Body() body: Record<string, unknown>) {
    const url = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
    if (!this.service.validateSignature(signature, url, body)) {
      throw new BadRequestException("Invalid Twilio signature");
    }
    const from = typeof body.From === "string" ? body.From : "";
    const text = typeof body.Body === "string" ? body.Body : "";
    return this.service.handleInbound(from, text);
  }
}
