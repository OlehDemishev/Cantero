import { Module } from "@nestjs/common";
import { FinanceModule } from "../finance/finance.module";
import { InsightsController } from "./insights.controller";
import { InsightsService } from "./insights.service";

@Module({
  imports: [FinanceModule],
  controllers: [InsightsController],
  providers: [InsightsService],
})
export class InsightsModule {}
