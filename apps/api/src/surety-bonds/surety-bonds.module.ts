import { Module } from "@nestjs/common";
import { SuretyBondsController } from "./surety-bonds.controller";
import { SuretyBondsService } from "./surety-bonds.service";

@Module({
  controllers: [SuretyBondsController],
  providers: [SuretyBondsService],
})
export class SuretyBondsModule {}
