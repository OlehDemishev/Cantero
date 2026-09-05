import { Module } from "@nestjs/common";
import { TransmittalsController } from "./transmittals.controller";
import { TransmittalsService } from "./transmittals.service";

@Module({
  controllers: [TransmittalsController],
  providers: [TransmittalsService],
})
export class TransmittalsModule {}
