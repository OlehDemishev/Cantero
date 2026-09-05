-- CreateEnum
CREATE TYPE "InventoryCostingMethod" AS ENUM ('fifo', 'weighted_average');

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "inventoryCostingMethod" "InventoryCostingMethod" NOT NULL DEFAULT 'weighted_average',
ADD COLUMN     "submittalEscalationEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "stock_levels" ADD COLUMN     "averageCost" DECIMAL(12,4);

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "unitCost" DECIMAL(12,4);

-- AlterTable
ALTER TABLE "submittals" ADD COLUMN     "escalatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "inventory_cost_layers" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "materialCatalogItemId" TEXT NOT NULL,
    "remainingQuantity" DECIMAL(14,4) NOT NULL,
    "unitCost" DECIMAL(12,4) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_cost_layers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_cost_layers_companyId_idx" ON "inventory_cost_layers"("companyId");

-- CreateIndex
CREATE INDEX "inventory_cost_layers_warehouseId_materialCatalogItemId_rec_idx" ON "inventory_cost_layers"("warehouseId", "materialCatalogItemId", "receivedAt");

-- AddForeignKey
ALTER TABLE "inventory_cost_layers" ADD CONSTRAINT "inventory_cost_layers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_cost_layers" ADD CONSTRAINT "inventory_cost_layers_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_cost_layers" ADD CONSTRAINT "inventory_cost_layers_materialCatalogItemId_fkey" FOREIGN KEY ("materialCatalogItemId") REFERENCES "material_catalog_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

