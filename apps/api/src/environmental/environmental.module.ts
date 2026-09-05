import { Module } from "@nestjs/common";
import { EnvironmentalController } from "./environmental.controller";
import { EnvironmentalService } from "./environmental.service";

@Module({
  controllers: [EnvironmentalController],
  providers: [EnvironmentalService],
})
export class EnvironmentalModule {}
