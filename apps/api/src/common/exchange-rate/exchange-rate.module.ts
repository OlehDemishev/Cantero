import { Global, Module } from "@nestjs/common";
import { ExchangeRateController } from "./exchange-rate.controller";
import { ExchangeRateService } from "./exchange-rate.service";

@Global()
@Module({ controllers: [ExchangeRateController], providers: [ExchangeRateService], exports: [ExchangeRateService] })
export class ExchangeRateModule {}
