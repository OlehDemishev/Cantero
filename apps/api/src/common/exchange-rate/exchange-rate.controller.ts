import { Controller, Get } from "@nestjs/common";
import { ExchangeRateService } from "./exchange-rate.service";
import { OpenToAllRoles } from "../decorators/roles.decorator";

@OpenToAllRoles("company directory and calendars every member reads; changes carry their own @Requires")
@Controller("exchange-rates")
export class ExchangeRateController {
  constructor(private readonly service: ExchangeRateService) {}

  @Get()
  list() {
    return this.service.list();
  }
}
