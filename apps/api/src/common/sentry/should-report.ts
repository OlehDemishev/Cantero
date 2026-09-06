import { HttpException, HttpStatus } from "@nestjs/common";

/** Decides whether an exception is worth reporting to Sentry. A thrown HttpException with a
 * status below 500 (BadRequestException, UnauthorizedException, NotFoundException, the 429 from
 * RateLimiterService, ...) is expected control flow — normal validation/auth/business-rule
 * rejections a user can trigger just by using the app "wrong," not a bug. Only a raw
 * (non-HttpException) error or an HttpException at 500+ represents something actually broken. */
export function shouldReportToSentry(exception: unknown): boolean {
  if (!(exception instanceof HttpException)) return true;
  return exception.getStatus() >= HttpStatus.INTERNAL_SERVER_ERROR;
}
