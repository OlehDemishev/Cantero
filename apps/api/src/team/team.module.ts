import { Module } from "@nestjs/common";
import { WorkersController } from "./workers.controller";
import { WorkersService } from "./workers.service";
import { TimeEntriesController } from "./time-entries.controller";
import { TimeEntriesService } from "./time-entries.service";
import { LaborCostController } from "./labor-cost.controller";
import { LaborCostService } from "./labor-cost.service";

@Module({
  controllers: [WorkersController, TimeEntriesController, LaborCostController],
  providers: [WorkersService, TimeEntriesService, LaborCostService],
  exports: [WorkersService],
})
export class TeamModule {}
