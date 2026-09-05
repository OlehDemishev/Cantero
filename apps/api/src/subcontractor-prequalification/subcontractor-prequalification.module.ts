import { Module } from "@nestjs/common";
import { SubcontractorPrequalificationController } from "./subcontractor-prequalification.controller";
import { SubcontractorPrequalificationService } from "./subcontractor-prequalification.service";

@Module({
  controllers: [SubcontractorPrequalificationController],
  providers: [SubcontractorPrequalificationService],
  exports: [SubcontractorPrequalificationService],
})
export class SubcontractorPrequalificationModule {}
