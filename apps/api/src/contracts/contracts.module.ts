import { Module } from "@nestjs/common";
import { ContractTemplatesController } from "./contract-templates.controller";
import { ContractTemplatesService } from "./contract-templates.service";
import { ContractsController } from "./contracts.controller";
import { ContractsService } from "./contracts.service";
import { DocusignController } from "./docusign.controller";
import { DocusignService } from "./docusign.service";
import { DocusignPollingService } from "./docusign-polling.service";
import { DocusignPollingProcessor } from "./docusign-polling.processor";
import { PublicContractsController } from "./public-contracts.controller";
import { backgroundProviders } from "../common/queue/process-role";

@Module({
  controllers: [ContractTemplatesController, ContractsController, PublicContractsController, DocusignController],
  providers: [ContractTemplatesService, ContractsService, DocusignService, DocusignPollingService, ...backgroundProviders(DocusignPollingProcessor)],
})
export class ContractsModule {}
