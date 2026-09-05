import { Module } from "@nestjs/common";
import { SubcontractorClaimsController } from "./subcontractor-claims.controller";
import { SubcontractorClaimsService } from "./subcontractor-claims.service";

@Module({
  controllers: [SubcontractorClaimsController],
  providers: [SubcontractorClaimsService],
})
export class SubcontractorClaimsModule {}
