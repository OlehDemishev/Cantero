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
import { LotExpiringRemindersService } from "./lot-expiring-reminders.service";
import { LotExpiringRemindersProcessor } from "./lot-expiring-reminders.processor";
import { StockReservationsController } from "./stock-reservations.controller";
import { StockReservationsService } from "./stock-reservations.service";
import { UnitsOfMeasureController } from "./units-of-measure.controller";
import { UnitsOfMeasureService } from "./units-of-measure.service";
import { WarehouseLocationsController } from "./warehouse-locations.controller";
import { WarehouseLocationsService } from "./warehouse-locations.service";
import { SupplierReturnsController } from "./supplier-returns.controller";
import { SupplierReturnsService } from "./supplier-returns.service";
import { StockKitsController } from "./stock-kits.controller";
import { StockKitsService } from "./stock-kits.service";

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
    StockReservationsController,
    UnitsOfMeasureController,
    WarehouseLocationsController,
    SupplierReturnsController,
    StockKitsController,
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
    LotExpiringRemindersService,
    LotExpiringRemindersProcessor,
    StockReservationsService,
    UnitsOfMeasureService,
    WarehouseLocationsService,
    SupplierReturnsService,
    StockKitsService,
  ],
  exports: [MaterialCatalogService, StockService],
})
export class MaterialsModule {}
