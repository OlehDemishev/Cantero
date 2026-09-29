import { Module } from "@nestjs/common";
import { EstimatesModule } from "../estimates/estimates.module";
import { ChangeOrderRemindersService } from "./change-order-reminders.service";
import { ChangeOrderRemindersProcessor } from "./change-order-reminders.processor";
import { backgroundProviders } from "../common/queue/process-role";

@Module({
  imports: [EstimatesModule],
  providers: [ChangeOrderRemindersService, ...backgroundProviders(ChangeOrderRemindersProcessor)],
})
export class ChangeOrderRemindersModule {}
