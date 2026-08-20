import { Module } from "@nestjs/common";
import { RateCatalogController } from "./rate-catalog.controller";
import { RateCatalogService } from "./rate-catalog.service";
import { EstimatesController } from "./estimates.controller";
import { PublicEstimatesController } from "./public-estimates.controller";
import { EstimatesService } from "./estimates.service";
import { ChangeOrdersController } from "./change-orders.controller";
import { PublicChangeOrdersController } from "./public-change-orders.controller";
import { ChangeOrdersService } from "./change-orders.service";

@Module({
  controllers: [
    RateCatalogController,
    EstimatesController,
    PublicEstimatesController,
    ChangeOrdersController,
    PublicChangeOrdersController,
  ],
  providers: [RateCatalogService, EstimatesService, ChangeOrdersService],
  exports: [EstimatesService],
})
export class EstimatesModule {}
