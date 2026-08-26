import { Module } from "@nestjs/common";
import { EstimatesModule } from "../estimates/estimates.module";
import { EstimateRemindersService } from "./estimate-reminders.service";
import { EstimateRemindersProcessor } from "./estimate-reminders.processor";

@Module({
  imports: [EstimatesModule],
  providers: [EstimateRemindersService, EstimateRemindersProcessor],
})
export class EstimateRemindersModule {}
