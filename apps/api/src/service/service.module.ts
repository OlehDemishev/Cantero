import { Module } from "@nestjs/common";
import { ServiceContractsController } from "./service-contracts.controller";
import { ServiceContractsService } from "./service-contracts.service";
import { ServiceVisitsController } from "./service-visits.controller";
import { ServiceVisitsService } from "./service-visits.service";
import { ServiceVisitRemindersService } from "./service-visit-reminders.service";
import { ServiceVisitRemindersProcessor } from "./service-visit-reminders.processor";
import { backgroundProviders } from "../common/queue/process-role";

@Module({
  controllers: [ServiceContractsController, ServiceVisitsController],
  providers: [ServiceContractsService, ServiceVisitsService, ServiceVisitRemindersService, ...backgroundProviders(ServiceVisitRemindersProcessor)],
})
export class ServiceModule {}
