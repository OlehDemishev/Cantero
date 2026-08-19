import { Module } from "@nestjs/common";
import { RateCatalogController } from "./rate-catalog.controller";
import { RateCatalogService } from "./rate-catalog.service";
import { EstimatesController } from "./estimates.controller";
import { PublicEstimatesController } from "./public-estimates.controller";
import { EstimatesService } from "./estimates.service";

@Module({
  controllers: [RateCatalogController, EstimatesController, PublicEstimatesController],
  providers: [RateCatalogService, EstimatesService],
})
export class EstimatesModule {}
