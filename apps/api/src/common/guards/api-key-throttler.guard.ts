import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";

/** Rate-limits /v1/* by API key rather than by IP — several integrations can share an office
 * network, and a single misbehaving key shouldn't need an IP-level block to contain it.
 * Relies on ApiKeyGuard running first in the same @UseGuards() list to set request.companyId. */
@Injectable()
export class ApiKeyThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    return req.companyId ?? req.headers["x-api-key"] ?? req.ip;
  }
}
