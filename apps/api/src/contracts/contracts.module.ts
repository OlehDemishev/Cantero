import { Module } from "@nestjs/common";
import { ContractTemplatesController } from "./contract-templates.controller";
import { ContractTemplatesService } from "./contract-templates.service";
import { ContractsController } from "./contracts.controller";
import { ContractsService } from "./contracts.service";
import { DocusignController } from "./docusign.controller";
import { DocusignService } from "./docusign.service";
import { PublicContractsController } from "./public-contracts.controller";

@Module({
  controllers: [ContractTemplatesController, ContractsController, PublicContractsController, DocusignController],
  providers: [ContractTemplatesService, ContractsService, DocusignService],
})
export class ContractsModule {}
