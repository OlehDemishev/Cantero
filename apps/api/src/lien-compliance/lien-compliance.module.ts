import { Module } from "@nestjs/common";
import { LienComplianceController } from "./lien-compliance.controller";
import { LienComplianceService } from "./lien-compliance.service";

@Module({
  controllers: [LienComplianceController],
  providers: [LienComplianceService],
})
export class LienComplianceModule {}
