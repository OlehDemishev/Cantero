import { Module } from "@nestjs/common";
import { IncidentReportsController } from "./incident-reports.controller";
import { IncidentReportsService } from "./incident-reports.service";
import { SafetyBriefingsController } from "./safety-briefings.controller";
import { SafetyBriefingsService } from "./safety-briefings.service";
import { SafetyAnalyticsController } from "./safety-analytics.controller";
import { SafetyAnalyticsService } from "./safety-analytics.service";
import { JhaController } from "./jha.controller";
import { JhaService } from "./jha.service";
import { InsuranceClaimsController } from "./insurance-claims.controller";
import { InsuranceClaimsService } from "./insurance-claims.service";

@Module({
  controllers: [IncidentReportsController, SafetyBriefingsController, SafetyAnalyticsController, JhaController, InsuranceClaimsController],
  providers: [IncidentReportsService, SafetyBriefingsService, SafetyAnalyticsService, JhaService, InsuranceClaimsService],
})
export class SafetyModule {}
