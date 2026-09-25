import { Module } from "@nestjs/common";
import { SecretsBackfillService } from "./secrets-backfill.service";

@Module({ providers: [SecretsBackfillService] })
export class CryptoModule {}
