import { Module } from "@nestjs/common";
import { ContractTemplatesController } from "./contract-templates.controller";
import { ContractTemplatesService } from "./contract-templates.service";
import { ContractsController } from "./contracts.controller";
import { ContractsService } from "./contracts.service";
import { PublicContractsController } from "./public-contracts.controller";

@Module({
  controllers: [ContractTemplatesController, ContractsController, PublicContractsController],
  providers: [ContractTemplatesService, ContractsService],
})
export class ContractsModule {}
