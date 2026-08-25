import { Module } from "@nestjs/common";
import { WorkersController } from "./workers.controller";
import { WorkersService } from "./workers.service";
import { TimeEntriesController } from "./time-entries.controller";
import { TimeEntriesService } from "./time-entries.service";
import { LaborCostController } from "./labor-cost.controller";
import { LaborCostService } from "./labor-cost.service";
import { ExpensesController } from "./expenses.controller";
import { ExpensesService } from "./expenses.service";
import { TimeOffController } from "./time-off.controller";
import { TimeOffService } from "./time-off.service";

@Module({
  controllers: [WorkersController, TimeEntriesController, LaborCostController, ExpensesController, TimeOffController],
  providers: [WorkersService, TimeEntriesService, LaborCostService, ExpensesService, TimeOffService],
  exports: [WorkersService, TimeEntriesService],
})
export class TeamModule {}
