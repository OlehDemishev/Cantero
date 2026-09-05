import { Module } from "@nestjs/common";
import { CalibrationController } from "./calibration.controller";
import { CalibrationService } from "./calibration.service";

@Module({
  controllers: [CalibrationController],
  providers: [CalibrationService],
})
export class CalibrationModule {}
