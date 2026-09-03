import { Module } from "@nestjs/common";
import { HrCasesController } from "./hr-cases.controller";
import { HrCasesService } from "./hr-cases.service";

@Module({
  controllers: [HrCasesController],
  providers: [HrCasesService],
})
export class HrCasesModule {}
