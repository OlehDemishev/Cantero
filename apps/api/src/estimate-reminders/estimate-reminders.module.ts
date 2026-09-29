import { Module } from "@nestjs/common";
import { EstimatesModule } from "../estimates/estimates.module";
import { EstimateRemindersService } from "./estimate-reminders.service";
import { EstimateRemindersProcessor } from "./estimate-reminders.processor";
import { backgroundProviders } from "../common/queue/process-role";

@Module({
  imports: [EstimatesModule],
  providers: [EstimateRemindersService, ...backgroundProviders(EstimateRemindersProcessor)],
})
export class EstimateRemindersModule {}
