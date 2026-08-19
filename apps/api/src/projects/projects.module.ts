import { Module } from "@nestjs/common";
import { ProjectsController } from "./projects.controller";
import { ProjectsService } from "./projects.service";
import { TasksController } from "./tasks.controller";
import { TasksService } from "./tasks.service";
import { MilestonesController } from "./milestones.controller";
import { MilestonesService } from "./milestones.service";

@Module({
  controllers: [ProjectsController, TasksController, MilestonesController],
  providers: [ProjectsService, TasksService, MilestonesService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
