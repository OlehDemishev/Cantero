-- CreateEnum
CREATE TYPE "WarehouseLocationKind" AS ENUM ('zone', 'aisle', 'rack', 'bin');

-- AlterTable
ALTER TABLE "stock_levels" ADD COLUMN     "binLocationId" TEXT;

-- CreateTable
CREATE TABLE "warehouse_locations" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "parentId" TEXT,
    "kind" "WarehouseLocationKind" NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warehouse_locations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "warehouse_locations_companyId_idx" ON "warehouse_locations"("companyId");

-- CreateIndex
CREATE INDEX "warehouse_locations_warehouseId_idx" ON "warehouse_locations"("warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_locations_warehouseId_parentId_code_key" ON "warehouse_locations"("warehouseId", "parentId", "code");

-- CreateIndex
CREATE INDEX "stock_levels_binLocationId_idx" ON "stock_levels"("binLocationId");

-- AddForeignKey
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_binLocationId_fkey" FOREIGN KEY ("binLocationId") REFERENCES "warehouse_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_locations" ADD CONSTRAINT "warehouse_locations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_locations" ADD CONSTRAINT "warehouse_locations_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_locations" ADD CONSTRAINT "warehouse_locations_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "warehouse_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

