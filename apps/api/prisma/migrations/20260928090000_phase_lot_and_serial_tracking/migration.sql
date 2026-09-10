-- CreateEnum
CREATE TYPE "ToolCribUnitStatus" AS ENUM ('available', 'checked_out', 'damaged', 'lost', 'retired');

-- AlterTable
ALTER TABLE "material_catalog_items" ADD COLUMN     "lotTracked" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "tool_checkouts" ADD COLUMN     "toolCribUnitId" TEXT;

-- AlterTable
ALTER TABLE "tool_crib_items" ADD COLUMN     "serialTracked" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "stock_lots" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "materialCatalogItemId" TEXT NOT NULL,
    "lotNumber" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "initialQuantity" DECIMAL(14,4) NOT NULL,
    "remainingQuantity" DECIMAL(14,4) NOT NULL,
    "unitCost" DECIMAL(12,4),
    "expiringNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_lot_movements" (
    "id" TEXT NOT NULL,
    "stockMovementId" TEXT NOT NULL,
    "stockLotId" TEXT NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,

    CONSTRAINT "stock_lot_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tool_crib_units" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "toolCribItemId" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "status" "ToolCribUnitStatus" NOT NULL DEFAULT 'available',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tool_crib_units_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_lots_companyId_idx" ON "stock_lots"("companyId");

-- CreateIndex
CREATE INDEX "stock_lots_warehouseId_materialCatalogItemId_expiresAt_idx" ON "stock_lots"("warehouseId", "materialCatalogItemId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "stock_lots_warehouseId_materialCatalogItemId_lotNumber_key" ON "stock_lots"("warehouseId", "materialCatalogItemId", "lotNumber");

-- CreateIndex
CREATE INDEX "stock_lot_movements_stockMovementId_idx" ON "stock_lot_movements"("stockMovementId");

-- CreateIndex
CREATE INDEX "stock_lot_movements_stockLotId_idx" ON "stock_lot_movements"("stockLotId");

-- CreateIndex
CREATE INDEX "tool_crib_units_companyId_idx" ON "tool_crib_units"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "tool_crib_units_toolCribItemId_serialNumber_key" ON "tool_crib_units"("toolCribItemId", "serialNumber");

-- CreateIndex
CREATE INDEX "tool_checkouts_toolCribUnitId_idx" ON "tool_checkouts"("toolCribUnitId");

-- AddForeignKey
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_materialCatalogItemId_fkey" FOREIGN KEY ("materialCatalogItemId") REFERENCES "material_catalog_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_lot_movements" ADD CONSTRAINT "stock_lot_movements_stockMovementId_fkey" FOREIGN KEY ("stockMovementId") REFERENCES "stock_movements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_lot_movements" ADD CONSTRAINT "stock_lot_movements_stockLotId_fkey" FOREIGN KEY ("stockLotId") REFERENCES "stock_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_crib_units" ADD CONSTRAINT "tool_crib_units_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_crib_units" ADD CONSTRAINT "tool_crib_units_toolCribItemId_fkey" FOREIGN KEY ("toolCribItemId") REFERENCES "tool_crib_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_checkouts" ADD CONSTRAINT "tool_checkouts_toolCribUnitId_fkey" FOREIGN KEY ("toolCribUnitId") REFERENCES "tool_crib_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

