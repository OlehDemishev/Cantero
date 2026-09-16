-- AlterEnum
ALTER TYPE "ToolCribUnitStatus" ADD VALUE 'consumed';

-- AlterTable
ALTER TABLE "material_catalog_items" ADD COLUMN     "serialTracked" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "tool_crib_units" ADD COLUMN     "materialCatalogItemId" TEXT,
ADD COLUMN     "warehouseId" TEXT,
ALTER COLUMN "toolCribItemId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "stock_unit_movements" (
    "id" TEXT NOT NULL,
    "stockMovementId" TEXT NOT NULL,
    "toolCribUnitId" TEXT NOT NULL,

    CONSTRAINT "stock_unit_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_unit_movements_stockMovementId_idx" ON "stock_unit_movements"("stockMovementId");

-- CreateIndex
CREATE INDEX "stock_unit_movements_toolCribUnitId_idx" ON "stock_unit_movements"("toolCribUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_unit_movements_stockMovementId_toolCribUnitId_key" ON "stock_unit_movements"("stockMovementId", "toolCribUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "tool_crib_units_warehouseId_materialCatalogItemId_serialNum_key" ON "tool_crib_units"("warehouseId", "materialCatalogItemId", "serialNumber");

-- AddForeignKey
ALTER TABLE "tool_crib_units" ADD CONSTRAINT "tool_crib_units_materialCatalogItemId_fkey" FOREIGN KEY ("materialCatalogItemId") REFERENCES "material_catalog_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_crib_units" ADD CONSTRAINT "tool_crib_units_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_unit_movements" ADD CONSTRAINT "stock_unit_movements_stockMovementId_fkey" FOREIGN KEY ("stockMovementId") REFERENCES "stock_movements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_unit_movements" ADD CONSTRAINT "stock_unit_movements_toolCribUnitId_fkey" FOREIGN KEY ("toolCribUnitId") REFERENCES "tool_crib_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

