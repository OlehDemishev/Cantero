import "reflect-metadata";
import { writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { initSentry } from "./common/sentry/init-sentry";
import { assertQuickbooksProductionSafety } from "./accounting/quickbooks-production-safety";
import { assertProductionConfig, productionConfigWarnings } from "./common/config/production-config";

/**
 * The background half of the app: the same AppModule as main.ts, without the HTTP server, running
 * every queue processor — OCR of drawing sets, the meaning-based search index, reminders, digests,
 * recurring invoices, webhook delivery. The API process (PROCESS_ROLE=api) only enqueues, so none of
 * this competes with requests. See common/queue/process-role.ts.
 */

// Before any module file loads: modules decide which providers to register as they load.
process.env.PROCESS_ROLE = "worker";

// The container's health check reads this file's age — there's no HTTP endpoint to ask.
export const HEARTBEAT_FILE = join(tmpdir(), "cantero-worker-alive");
const HEARTBEAT_MS = 30_000;

initSentry();

async function bootstrap() {
  assertProductionConfig(process.env);
  assertQuickbooksProductionSafety(process.env);
  const { AppModule } = await import("./app.module");
  const app = await NestFactory.createApplicationContext(AppModule);
  // SIGTERM from `docker compose stop` lets each BullMQ worker finish or hand back its current job.
  app.enableShutdownHooks();
  const logger = new Logger("Worker");
  for (const warning of productionConfigWarnings(process.env)) new Logger("Config").warn(warning);

  const beat = () => writeFileSync(HEARTBEAT_FILE, new Date().toISOString());
  beat();
  setInterval(beat, HEARTBEAT_MS).unref();
  logger.log("Running the queue processors (PROCESS_ROLE=worker)");
}
bootstrap();
