import { Module } from "@nestjs/common";
import { RateCatalogController } from "./rate-catalog.controller";
import { RateCatalogService } from "./rate-catalog.service";
import { EstimatesController } from "./estimates.controller";
import { PublicEstimatesController } from "./public-estimates.controller";
import { EstimatesService } from "./estimates.service";
import { ChangeOrdersController } from "./change-orders.controller";
import { PublicChangeOrdersController } from "./public-change-orders.controller";
import { ChangeOrdersService } from "./change-orders.service";
import { AssembliesController } from "./assemblies.controller";
import { AssembliesService } from "./assemblies.service";

@Module({
  controllers: [
    RateCatalogController,
    EstimatesController,
    PublicEstimatesController,
    ChangeOrdersController,
    PublicChangeOrdersController,
    AssembliesController,
  ],
  providers: [RateCatalogService, EstimatesService, ChangeOrdersService, AssembliesService],
  exports: [EstimatesService, ChangeOrdersService],
})
export class EstimatesModule {}
