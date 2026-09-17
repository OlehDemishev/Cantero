import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { PublicApiModule } from "./public-api/public-api.module";
import { resolveTrustProxyHops } from "./common/trust-proxy";
import { initSentry } from "./common/sentry/init-sentry";
import { SentryExceptionsFilter } from "./common/sentry/sentry-exceptions.filter";
import { assertQuickbooksProductionSafety } from "./accounting/quickbooks-production-safety";

// Must run before the Nest app is created so Sentry's instrumentation can hook whatever it needs
// (http, the DB driver, ...) before those modules load. No-op unless SENTRY_DSN is set.
initSentry();

async function bootstrap() {
  assertQuickbooksProductionSafety(process.env);
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:3000", credentials: true });
  // Reports every unexpected error (a raw thrown error, or a 500+ HttpException) to Sentry, then
  // delegates to Nest's normal error-response handling — a no-op response-wise either way, and a
  // no-op error-reporting-wise too when Sentry isn't configured.
  app.useGlobalFilters(new SentryExceptionsFilter(app.getHttpAdapter()));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix("api");

  // Without this, Express's req.ip is always the immediate socket peer — behind any reverse
  // proxy/load balancer that's the proxy itself, not the real client, which would collapse
  // RateLimiterService's per-IP limits (login, 2FA, etc. — see auth.service.ts) onto a single
  // shared bucket for every user. Set to the exact number of proxy hops between the internet and
  // this process (usually 1 for a single load balancer/reverse proxy in front of it) so Express
  // reads the real client IP from X-Forwarded-For instead of trusting an attacker-supplied one.
  // Left unset (0) by default — safe for local dev and any deployment with no proxy in front.
  const trustProxyHops = resolveTrustProxyHops(process.env.TRUST_PROXY_HOPS);
  if (trustProxyHops > 0) app.set("trust proxy", trustProxyHops);

  // Docs cover only the public v1 integration API (PublicApiModule), not the internal
  // JWT-authenticated app surface — this is a reference for third-party integrators.
  const publicApiConfig = new DocumentBuilder()
    .setTitle("Cantero Public API")
    .setDescription("Read-only integration API for external tools (accounting, BI, custom scripts). Authenticate with an X-Api-Key header issued from Settings → API keys.")
    .setVersion("1.0")
    .addApiKey({ type: "apiKey", name: "X-Api-Key", in: "header" }, "apiKey")
    .build();
  const publicApiDocument = SwaggerModule.createDocument(app, publicApiConfig, { include: [PublicApiModule] });
  SwaggerModule.setup("api/docs", app, publicApiDocument);

  const port = process.env.PORT ? Number(process.env.PORT) : 4000;
  await app.listen(port);
}
bootstrap();
