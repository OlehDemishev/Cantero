import { Module } from "@nestjs/common";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";
import { CustomReportsController } from "./custom-reports.controller";
import { CustomReportsService } from "./custom-reports.service";

@Module({
  controllers: [ReportsController, CustomReportsController],
  providers: [ReportsService, CustomReportsService],
  exports: [ReportsService, CustomReportsService],
})
export class ReportsModule {}
