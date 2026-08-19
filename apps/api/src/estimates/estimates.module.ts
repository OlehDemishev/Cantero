import { Module } from "@nestjs/common";
import { RateCatalogController } from "./rate-catalog.controller";
import { RateCatalogService } from "./rate-catalog.service";
import { EstimatesController } from "./estimates.controller";
import { EstimatesService } from "./estimates.service";

@Module({
  controllers: [RateCatalogController, EstimatesController],
  providers: [RateCatalogService, EstimatesService],
})
export class EstimatesModule {}
