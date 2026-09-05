import { Module } from "@nestjs/common";
import { UnitPriceTmController } from "./unit-price-tm.controller";
import { UnitPriceTmService } from "./unit-price-tm.service";

@Module({
  controllers: [UnitPriceTmController],
  providers: [UnitPriceTmService],
})
export class UnitPriceTmModule {}
