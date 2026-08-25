import { Module } from "@nestjs/common";
import { InspectionTemplatesController } from "./inspection-templates.controller";
import { InspectionTemplatesService } from "./inspection-templates.service";
import { InspectionChecklistsController } from "./inspection-checklists.controller";
import { InspectionChecklistsService } from "./inspection-checklists.service";
import { DeficienciesController } from "./deficiencies.controller";
import { DeficienciesService } from "./deficiencies.service";

@Module({
  controllers: [InspectionTemplatesController, InspectionChecklistsController, DeficienciesController],
  providers: [InspectionTemplatesService, InspectionChecklistsService, DeficienciesService],
  exports: [DeficienciesService],
})
export class QualityModule {}
