import { Module } from "@nestjs/common";
import { EstimatesModule } from "../estimates/estimates.module";
import { ChangeOrderRemindersService } from "./change-order-reminders.service";
import { ChangeOrderRemindersProcessor } from "./change-order-reminders.processor";

@Module({
  imports: [EstimatesModule],
  providers: [ChangeOrderRemindersService, ChangeOrderRemindersProcessor],
})
export class ChangeOrderRemindersModule {}
