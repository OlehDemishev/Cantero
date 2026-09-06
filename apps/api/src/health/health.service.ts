import { Injectable } from "@nestjs/common";
import IORedis from "ioredis";
import { PrismaService } from "../common/prisma/prisma.service";
import { computeHealthReport, type CheckResult, type HealthReport } from "./health-status";

const REDIS_CHECK_TIMEOUT_MS = 2000;

/** For an orchestrator/load-balancer readiness probe — checks the two dependencies the app can't
 * function without (Postgres via Prisma, Redis via BullMQ) rather than just "the process is
 * running," which a hung DB connection pool wouldn't catch. */
@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthReport> {
    const [database, redis] = await Promise.all([this.checkDatabase(), this.checkRedis()]);
    return computeHealthReport({ database, redis });
  }

  private async checkDatabase(): Promise<CheckResult> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  /** A short-lived connection dedicated to the probe, separate from BullMQ's own long-lived
   * connection — so this check fails on its own merits rather than reporting BullMQ's internal
   * connection state (which may retry/reconnect on a different schedule than a probe should
   * wait for). */
  private async checkRedis(): Promise<CheckResult> {
    const redis = new IORedis(process.env.REDIS_URL ?? "", {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: REDIS_CHECK_TIMEOUT_MS,
    });
    try {
      await redis.connect();
      await redis.ping();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    } finally {
      redis.disconnect();
    }
  }
}
