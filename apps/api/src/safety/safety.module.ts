import { Module } from "@nestjs/common";
import { IncidentReportsController } from "./incident-reports.controller";
import { IncidentReportsService } from "./incident-reports.service";
import { SafetyBriefingsController } from "./safety-briefings.controller";
import { SafetyBriefingsService } from "./safety-briefings.service";

@Module({
  controllers: [IncidentReportsController, SafetyBriefingsController],
  providers: [IncidentReportsService, SafetyBriefingsService],
})
export class SafetyModule {}
