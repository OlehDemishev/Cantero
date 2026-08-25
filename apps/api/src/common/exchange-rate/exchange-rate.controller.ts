import { Controller, Get } from "@nestjs/common";
import { ExchangeRateService } from "./exchange-rate.service";

@Controller("exchange-rates")
export class ExchangeRateController {
  constructor(private readonly service: ExchangeRateService) {}

  @Get()
  list() {
    return this.service.list();
  }
}
