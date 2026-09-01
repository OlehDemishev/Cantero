import { Global, Module } from "@nestjs/common";
import { MessageTemplatesController } from "./message-templates.controller";
import { MessageTemplatesService } from "./message-templates.service";

/** Global like SmsModule/WebhooksModule — used from several unrelated domain services
 * (ResourcePlanningService, SafetyBriefingsService, ProjectsService, NpsSurveysService) that
 * shouldn't each need an explicit module import just to check for a company's custom wording. */
@Global()
@Module({
  controllers: [MessageTemplatesController],
  providers: [MessageTemplatesService],
  exports: [MessageTemplatesService],
})
export class MessageTemplatesModule {}
