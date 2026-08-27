import { Module } from "@nestjs/common";
import { IncidentReportsController } from "./incident-reports.controller";
import { IncidentReportsService } from "./incident-reports.service";
import { SafetyBriefingsController } from "./safety-briefings.controller";
import { SafetyBriefingsService } from "./safety-briefings.service";
import { SafetyAnalyticsController } from "./safety-analytics.controller";
import { SafetyAnalyticsService } from "./safety-analytics.service";

@Module({
  controllers: [IncidentReportsController, SafetyBriefingsController, SafetyAnalyticsController],
  providers: [IncidentReportsService, SafetyBriefingsService, SafetyAnalyticsService],
})
export class SafetyModule {}
