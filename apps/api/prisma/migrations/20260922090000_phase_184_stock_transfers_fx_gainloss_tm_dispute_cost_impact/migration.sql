-- CreateEnum
CREATE TYPE "StockTransferStatus" AS ENUM ('in_transit', 'received', 'cancelled');

-- AlterEnum
ALTER TYPE "TMTicketStatus" ADD VALUE 'disputed';

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "currency" "Currency",
ADD COLUMN     "exchangeRate" DECIMAL(12,6),
ADD COLUMN     "foreignAmount" DECIMAL(14,2),
ADD COLUMN     "fxGainLoss" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "punch_list_items" ADD COLUMN     "changeOrderId" TEXT,
ADD COLUMN     "estimatedCostImpact" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "rfis" ADD COLUMN     "changeOrderId" TEXT,
ADD COLUMN     "estimatedCostImpact" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "tm_tickets" ADD COLUMN     "disputeReason" TEXT,
ADD COLUMN     "revisionCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "stock_transfers" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fromWarehouseId" TEXT NOT NULL,
    "toWarehouseId" TEXT NOT NULL,
    "materialCatalogItemId" TEXT NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unitCost" DECIMAL(12,4),
    "status" "StockTransferStatus" NOT NULL DEFAULT 'in_transit',
    "initiatedByName" TEXT NOT NULL,
    "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedByName" TEXT,
    "receivedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_transfers_companyId_idx" ON "stock_transfers"("companyId");

-- CreateIndex
CREATE INDEX "stock_transfers_fromWarehouseId_idx" ON "stock_transfers"("fromWarehouseId");

-- CreateIndex
CREATE INDEX "stock_transfers_toWarehouseId_idx" ON "stock_transfers"("toWarehouseId");

-- CreateIndex
CREATE INDEX "punch_list_items_changeOrderId_idx" ON "punch_list_items"("changeOrderId");

-- CreateIndex
CREATE INDEX "rfis_changeOrderId_idx" ON "rfis"("changeOrderId");

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_fromWarehouseId_fkey" FOREIGN KEY ("fromWarehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_toWarehouseId_fkey" FOREIGN KEY ("toWarehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_materialCatalogItemId_fkey" FOREIGN KEY ("materialCatalogItemId") REFERENCES "material_catalog_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "punch_list_items" ADD CONSTRAINT "punch_list_items_changeOrderId_fkey" FOREIGN KEY ("changeOrderId") REFERENCES "change_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfis" ADD CONSTRAINT "rfis_changeOrderId_fkey" FOREIGN KEY ("changeOrderId") REFERENCES "change_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

