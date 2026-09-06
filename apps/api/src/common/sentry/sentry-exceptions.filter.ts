import { ArgumentsHost, Catch } from "@nestjs/common";
import { BaseExceptionFilter } from "@nestjs/core";
import * as Sentry from "@sentry/node";
import { shouldReportToSentry } from "./should-report";

/** Registered as the single global exception filter (see main.ts) — reports every unexpected
 * error (a raw thrown error, or an HttpException at 500+) to Sentry, then delegates to Nest's own
 * BaseExceptionFilter so the actual HTTP response behavior is unchanged. A no-op when Sentry
 * isn't configured (Sentry.captureException is a no-op itself before Sentry.init runs). */
@Catch()
export class SentryExceptionsFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    if (shouldReportToSentry(exception)) {
      Sentry.captureException(exception);
    }
    super.catch(exception, host);
  }
}
