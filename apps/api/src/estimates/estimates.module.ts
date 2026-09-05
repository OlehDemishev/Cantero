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
import { CatalogsController } from "./catalogs.controller";
import { CatalogsService } from "./catalogs.service";
import { TakeoffsController } from "./takeoffs.controller";
import { TakeoffsService } from "./takeoffs.service";
import { MarkupRulesController } from "./markup-rules.controller";
import { MarkupRulesService } from "./markup-rules.service";
import { EstimateAlternatesController } from "./estimate-alternates.controller";
import { EstimateAlternatesService } from "./estimate-alternates.service";

@Module({
  controllers: [
    RateCatalogController,
    EstimatesController,
    PublicEstimatesController,
    ChangeOrdersController,
    PublicChangeOrdersController,
    AssembliesController,
    CatalogsController,
    TakeoffsController,
    MarkupRulesController,
    EstimateAlternatesController,
  ],
  providers: [
    RateCatalogService,
    EstimatesService,
    ChangeOrdersService,
    AssembliesService,
    CatalogsService,
    TakeoffsService,
    MarkupRulesService,
    EstimateAlternatesService,
  ],
  exports: [EstimatesService, ChangeOrdersService],
})
export class EstimatesModule {}
