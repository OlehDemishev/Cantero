import { Module } from "@nestjs/common";
import { ProjectsController } from "./projects.controller";
import { ProjectsService } from "./projects.service";
import { TasksController } from "./tasks.controller";
import { TasksService } from "./tasks.service";
import { MilestonesController } from "./milestones.controller";
import { MilestonesService } from "./milestones.service";
import { DailyLogsController } from "./daily-logs.controller";
import { DailyLogsService } from "./daily-logs.service";
import { PunchListController } from "./punch-list.controller";
import { PunchListService } from "./punch-list.service";
import { RfiController } from "./rfi.controller";
import { RfiService } from "./rfi.service";
import { SubmittalsController } from "./submittals.controller";
import { SubmittalsService } from "./submittals.service";
import { WarrantyClaimsController } from "./warranty-claims.controller";
import { WarrantyClaimsService } from "./warranty-claims.service";
import { WeatherModule } from "../weather/weather.module";

@Module({
  imports: [WeatherModule],
  controllers: [
    ProjectsController,
    TasksController,
    MilestonesController,
    DailyLogsController,
    PunchListController,
    RfiController,
    SubmittalsController,
    WarrantyClaimsController,
  ],
  providers: [
    ProjectsService,
    TasksService,
    MilestonesService,
    DailyLogsService,
    PunchListService,
    RfiService,
    SubmittalsService,
    WarrantyClaimsService,
  ],
  exports: [ProjectsService, PunchListService],
})
export class ProjectsModule {}
