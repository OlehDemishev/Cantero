import { Module } from "@nestjs/common";
import { PermitsController } from "./permits.controller";
import { PermitsService } from "./permits.service";
import { InspectionsController } from "./inspections.controller";
import { InspectionsService } from "./inspections.service";
import { PermitExpiringRemindersService } from "./permit-expiring-reminders.service";
import { PermitExpiringRemindersProcessor } from "./permit-expiring-reminders.processor";
import { backgroundProviders } from "../common/queue/process-role";

@Module({
  controllers: [PermitsController, InspectionsController],
  providers: [PermitsService, InspectionsService, PermitExpiringRemindersService, ...backgroundProviders(PermitExpiringRemindersProcessor)],
})
export class PermitsModule {}
