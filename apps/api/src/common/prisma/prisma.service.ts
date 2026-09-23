import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

/**
 * Columns no query returns unless it asks for them by name (`omit: { column: false }`) — a secret
 * that a plain `include: { worker: true }` somewhere would otherwise send to the browser.
 */
export const GLOBAL_OMIT = {
  worker: { clockInPinHash: true },
} as const;

@Injectable()
export class PrismaService extends PrismaClient<{ omit: typeof GLOBAL_OMIT }> implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ omit: GLOBAL_OMIT });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
