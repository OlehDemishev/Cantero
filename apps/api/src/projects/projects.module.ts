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
import { ProjectCloseoutService } from "./project-closeout.service";
import { NpsSurveysController } from "./nps-surveys.controller";
import { NpsSurveysService } from "./nps-surveys.service";
import { SiteSignInsController } from "./site-sign-ins.controller";
import { SiteSignInsService } from "./site-sign-ins.service";
import { ScheduleBaselineController } from "./schedule-baseline.controller";
import { ScheduleBaselineService } from "./schedule-baseline.service";
import { MeetingsController } from "./meetings.controller";
import { MeetingsService } from "./meetings.service";
import { MsProjectController } from "./ms-project.controller";
import { MsProjectService } from "./ms-project.service";
import { AutodeskController } from "./autodesk.controller";
import { ScheduleFilesController } from "./schedule-files.controller";
import { ScheduleFilesService } from "./schedule-files.service";
import { AutodeskService } from "./autodesk.service";
import { WeatherModule } from "../weather/weather.module";
import { FinanceModule } from "../finance/finance.module";
import { DocumentsModule } from "../documents/documents.module";

@Module({
  imports: [WeatherModule, FinanceModule, DocumentsModule],
  controllers: [
    ProjectsController,
    TasksController,
    MilestonesController,
    DailyLogsController,
    PunchListController,
    RfiController,
    SubmittalsController,
    WarrantyClaimsController,
    NpsSurveysController,
    SiteSignInsController,
    ScheduleBaselineController,
    MeetingsController,
    MsProjectController,
    AutodeskController,
    ScheduleFilesController,
  ],
  providers: [
    ProjectsService,
    TasksService,
    ScheduleFilesService,
    MilestonesService,
    DailyLogsService,
    PunchListService,
    RfiService,
    SubmittalsService,
    WarrantyClaimsService,
    ProjectCloseoutService,
    NpsSurveysService,
    SiteSignInsService,
    ScheduleBaselineService,
    MeetingsService,
    MsProjectService,
    AutodeskService,
  ],
  exports: [ProjectsService, PunchListService, TasksService],
})
export class ProjectsModule {}
