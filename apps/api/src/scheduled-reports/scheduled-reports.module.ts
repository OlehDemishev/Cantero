import { Module } from "@nestjs/common";
import { ScheduledReportsController } from "./scheduled-reports.controller";
import { ScheduledReportsService } from "./scheduled-reports.service";
import { ScheduledReportsProcessor } from "./scheduled-reports.processor";
import { ReportsModule } from "../reports/reports.module";

@Module({
  imports: [ReportsModule],
  controllers: [ScheduledReportsController],
  providers: [ScheduledReportsService, ScheduledReportsProcessor],
})
export class ScheduledReportsModule {}
