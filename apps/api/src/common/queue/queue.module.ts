import { Global, Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { ConfigModule, ConfigService } from "@nestjs/config";
import IORedis from "ioredis";

export const STOCK_ALERTS_QUEUE = "stock-alerts";
export const PUSH_CHECK_QUEUE = "push-check";

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // BullMQ requires maxRetriesPerRequest: null on the connection it uses for blocking commands.
        connection: new IORedis(config.getOrThrow<string>("REDIS_URL"), { maxRetriesPerRequest: null }),
      }),
    }),
    BullModule.registerQueue({ name: STOCK_ALERTS_QUEUE }),
    BullModule.registerQueue({ name: PUSH_CHECK_QUEUE }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
