import { Module } from "@nestjs/common";
import { ProjectsController } from "./projects.controller";
import { ProjectsService } from "./projects.service";
import { TasksController } from "./tasks.controller";
import { TasksService } from "./tasks.service";
import { MilestonesController } from "./milestones.controller";
import { MilestonesService } from "./milestones.service";
import { DailyLogsController } from "./daily-logs.controller";
import { DailyLogsService } from "./daily-logs.service";

@Module({
  controllers: [ProjectsController, TasksController, MilestonesController, DailyLogsController],
  providers: [ProjectsService, TasksService, MilestonesService, DailyLogsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
