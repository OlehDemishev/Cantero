import { Module } from "@nestjs/common";
import { ResourcePlanningController } from "./resource-planning.controller";
import { ScheduleScenariosController } from "./schedule-scenarios.controller";
import { ResourcePlanningService } from "./resource-planning.service";

@Module({
  controllers: [ResourcePlanningController, ScheduleScenariosController],
  providers: [ResourcePlanningService],
})
export class ResourcePlanningModule {}
