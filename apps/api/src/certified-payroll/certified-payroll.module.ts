import { Module } from "@nestjs/common";
import { CertifiedPayrollController } from "./certified-payroll.controller";
import { CertifiedPayrollService } from "./certified-payroll.service";
import { WageClassificationsController } from "./wage-classifications.controller";
import { WageClassificationsService } from "./wage-classifications.service";

@Module({
  controllers: [CertifiedPayrollController, WageClassificationsController],
  providers: [CertifiedPayrollService, WageClassificationsService],
})
export class CertifiedPayrollModule {}
