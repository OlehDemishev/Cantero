import { Module } from "@nestjs/common";
import { ServiceContractsController } from "./service-contracts.controller";
import { ServiceContractsService } from "./service-contracts.service";
import { ServiceVisitsController } from "./service-visits.controller";
import { ServiceVisitsService } from "./service-visits.service";
import { ServiceVisitRemindersService } from "./service-visit-reminders.service";
import { ServiceVisitRemindersProcessor } from "./service-visit-reminders.processor";

@Module({
  controllers: [ServiceContractsController, ServiceVisitsController],
  providers: [ServiceContractsService, ServiceVisitsService, ServiceVisitRemindersService, ServiceVisitRemindersProcessor],
})
export class ServiceModule {}
