import { Module } from "@nestjs/common";
import { ChecklistTemplatesController } from "./checklist-templates.controller";
import { ChecklistTemplatesService } from "./checklist-templates.service";
import { ProjectsModule } from "../projects/projects.module";

@Module({
  imports: [ProjectsModule],
  controllers: [ChecklistTemplatesController],
  providers: [ChecklistTemplatesService],
})
export class ChecklistTemplatesModule {}
