import { Module } from "@nestjs/common";
import { CostCodesController } from "./cost-codes.controller";
import { CostCodesService } from "./cost-codes.service";

@Module({
  controllers: [CostCodesController],
  providers: [CostCodesService],
})
export class CostCodesModule {}
