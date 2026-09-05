import { Module } from "@nestjs/common";
import { MaterialCatalogController } from "./material-catalog.controller";
import { MaterialCatalogService } from "./material-catalog.service";
import { WarehousesController } from "./warehouses.controller";
import { WarehousesService } from "./warehouses.service";
import { StockController } from "./stock.controller";
import { StockService } from "./stock.service";
import { SuppliersController } from "./suppliers.controller";
import { SuppliersService } from "./suppliers.service";
import { PurchaseOrdersController } from "./purchase-orders.controller";
import { PurchaseOrdersService } from "./purchase-orders.service";
import { LowStockProcessor } from "./low-stock.processor";
import { StockCountsController } from "./stock-counts.controller";
import { StockCountsService } from "./stock-counts.service";
import { MaterialRfqsController } from "./material-rfqs.controller";
import { MaterialRfqsService } from "./material-rfqs.service";
import { VendorBillsController } from "./vendor-bills.controller";
import { VendorBillsService } from "./vendor-bills.service";
import { StockTransfersController } from "./stock-transfers.controller";
import { StockTransfersService } from "./stock-transfers.service";
import { LongLeadItemsController } from "./long-lead-items.controller";
import { LongLeadItemsService } from "./long-lead-items.service";

@Module({
  controllers: [
    MaterialCatalogController,
    WarehousesController,
    StockController,
    SuppliersController,
    PurchaseOrdersController,
    StockCountsController,
    MaterialRfqsController,
    VendorBillsController,
    StockTransfersController,
    LongLeadItemsController,
  ],
  providers: [
    MaterialCatalogService,
    WarehousesService,
    StockService,
    SuppliersService,
    PurchaseOrdersService,
    LowStockProcessor,
    StockCountsService,
    MaterialRfqsService,
    VendorBillsService,
    StockTransfersService,
    LongLeadItemsService,
  ],
  exports: [MaterialCatalogService, StockService],
})
export class MaterialsModule {}
