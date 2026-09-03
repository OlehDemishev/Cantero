import { Module } from "@nestjs/common";
import { ContractClaimsController } from "./contract-claims.controller";
import { ContractClaimsService } from "./contract-claims.service";

@Module({
  controllers: [ContractClaimsController],
  providers: [ContractClaimsService],
})
export class ContractClaimsModule {}
