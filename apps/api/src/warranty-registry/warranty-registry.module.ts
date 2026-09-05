import { Module } from "@nestjs/common";
import { WarrantyRegistryController } from "./warranty-registry.controller";
import { WarrantyRegistryService } from "./warranty-registry.service";

@Module({
  controllers: [WarrantyRegistryController],
  providers: [WarrantyRegistryService],
})
export class WarrantyRegistryModule {}
