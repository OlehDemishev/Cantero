import { Module } from "@nestjs/common";
import { ProgressTrackingController } from "./progress-tracking.controller";
import { ProgressTrackingService } from "./progress-tracking.service";

@Module({
  controllers: [ProgressTrackingController],
  providers: [ProgressTrackingService],
})
export class ProgressTrackingModule {}
