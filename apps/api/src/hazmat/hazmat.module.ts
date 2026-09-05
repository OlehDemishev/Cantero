import { Module } from "@nestjs/common";
import { HazmatController } from "./hazmat.controller";
import { HazmatService } from "./hazmat.service";

@Module({
  controllers: [HazmatController],
  providers: [HazmatService],
})
export class HazmatModule {}
