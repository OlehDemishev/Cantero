import { Module } from "@nestjs/common";
import { ResourcePlanningController } from "./resource-planning.controller";
import { ResourcePlanningService } from "./resource-planning.service";

@Module({
  controllers: [ResourcePlanningController],
  providers: [ResourcePlanningService],
})
export class ResourcePlanningModule {}
