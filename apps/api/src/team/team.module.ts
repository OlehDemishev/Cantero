import { Module } from "@nestjs/common";
import { WorkersController } from "./workers.controller";
import { WorkersService } from "./workers.service";
import { TimeEntriesController } from "./time-entries.controller";
import { TimeEntriesService } from "./time-entries.service";
import { LaborCostController } from "./labor-cost.controller";
import { LaborCostService } from "./labor-cost.service";
import { ExpensesController } from "./expenses.controller";
import { ExpensesService } from "./expenses.service";
import { ReceiptOcrService } from "./receipt-ocr.service";
import { TimeOffController } from "./time-off.controller";
import { TimeOffService } from "./time-off.service";
import { CrewSmsBroadcastController } from "./crew-sms-broadcast.controller";
import { CrewSmsBroadcastService } from "./crew-sms-broadcast.service";
import { EnpsSurveysController } from "./enps-surveys.controller";
import { EnpsSurveysService } from "./enps-surveys.service";
import { EnpsSurveysProcessor } from "./enps-surveys.processor";
import { TrainingController } from "./training.controller";
import { TrainingService } from "./training.service";

@Module({
  controllers: [
    WorkersController,
    TimeEntriesController,
    LaborCostController,
    ExpensesController,
    TimeOffController,
    CrewSmsBroadcastController,
    EnpsSurveysController,
    TrainingController,
  ],
  providers: [
    WorkersService,
    TimeEntriesService,
    LaborCostService,
    ExpensesService,
    ReceiptOcrService,
    TimeOffService,
    CrewSmsBroadcastService,
    EnpsSurveysService,
    EnpsSurveysProcessor,
    TrainingService,
  ],
  exports: [WorkersService, TimeEntriesService, LaborCostService],
})
export class TeamModule {}
