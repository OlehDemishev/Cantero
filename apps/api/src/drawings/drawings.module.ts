import { Module } from "@nestjs/common";
import { DrawingSheetsController } from "./drawing-sheets.controller";
import { DrawingSheetsService } from "./drawing-sheets.service";
import { AnnotationsController } from "./annotations.controller";
import { AnnotationsService } from "./annotations.service";
import { DrawingSetsController } from "./drawing-sets.controller";
import { DrawingSetsService } from "./drawing-sets.service";
import { DrawingSetsProcessor } from "./drawing-sets.processor";

@Module({
  controllers: [DrawingSheetsController, DrawingSetsController, AnnotationsController],
  providers: [DrawingSheetsService, DrawingSetsService, DrawingSetsProcessor, AnnotationsService],
})
export class DrawingsModule {}
