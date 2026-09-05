import { Module } from "@nestjs/common";
import { ToolCribController } from "./tool-crib.controller";
import { ToolCribService } from "./tool-crib.service";

@Module({
  controllers: [ToolCribController],
  providers: [ToolCribService],
})
export class ToolCribModule {}
