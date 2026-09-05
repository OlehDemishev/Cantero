import { Module } from "@nestjs/common";
import { JobCostingController } from "./job-costing.controller";
import { JobCostingService } from "./job-costing.service";

@Module({
  controllers: [JobCostingController],
  providers: [JobCostingService],
  exports: [JobCostingService],
})
export class JobCostingModule {}
