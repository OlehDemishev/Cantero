import { Module } from "@nestjs/common";
import { CommissioningController } from "./commissioning.controller";
import { CommissioningService } from "./commissioning.service";

@Module({
  controllers: [CommissioningController],
  providers: [CommissioningService],
})
export class CommissioningModule {}
