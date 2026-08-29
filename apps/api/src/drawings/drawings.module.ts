import { Module } from "@nestjs/common";
import { DrawingSheetsController } from "./drawing-sheets.controller";
import { DrawingSheetsService } from "./drawing-sheets.service";
import { AnnotationsController } from "./annotations.controller";
import { AnnotationsService } from "./annotations.service";

@Module({
  controllers: [DrawingSheetsController, AnnotationsController],
  providers: [DrawingSheetsService, AnnotationsService],
})
export class DrawingsModule {}
