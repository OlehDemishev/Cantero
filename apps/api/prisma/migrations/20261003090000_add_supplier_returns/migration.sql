-- CreateEnum
CREATE TYPE "SupplierReturnStatus" AS ENUM ('draft', 'sent', 'confirmed');

-- CreateEnum
CREATE TYPE "SupplierReturnReason" AS ENUM ('defective', 'wrong_item', 'overstock', 'damaged_in_transit', 'other');

-- CreateTable
CREATE TABLE "supplier_returns" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "reason" "SupplierReturnReason" NOT NULL,
    "notes" TEXT,
    "status" "SupplierReturnStatus" NOT NULL DEFAULT 'draft',
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "supplier_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_return_lines" (
    "id" TEXT NOT NULL,
    "supplierReturnId" TEXT NOT NULL,
    "materialCatalogItemId" TEXT NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "stockMovementId" TEXT,

    CONSTRAINT "supplier_return_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplier_returns_companyId_idx" ON "supplier_returns"("companyId");

-- CreateIndex
CREATE INDEX "supplier_returns_supplierId_idx" ON "supplier_returns"("supplierId");

-- CreateIndex
CREATE INDEX "supplier_returns_purchaseOrderId_idx" ON "supplier_returns"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "supplier_return_lines_supplierReturnId_idx" ON "supplier_return_lines"("supplierReturnId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_id_companyId_key" ON "purchase_orders"("id", "companyId");

-- AddForeignKey
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_supplierId_companyId_fkey" FOREIGN KEY ("supplierId", "companyId") REFERENCES "suppliers"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_purchaseOrderId_companyId_fkey" FOREIGN KEY ("purchaseOrderId", "companyId") REFERENCES "purchase_orders"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_return_lines" ADD CONSTRAINT "supplier_return_lines_supplierReturnId_fkey" FOREIGN KEY ("supplierReturnId") REFERENCES "supplier_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_return_lines" ADD CONSTRAINT "supplier_return_lines_materialCatalogItemId_fkey" FOREIGN KEY ("materialCatalogItemId") REFERENCES "material_catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_return_lines" ADD CONSTRAINT "supplier_return_lines_stockMovementId_fkey" FOREIGN KEY ("stockMovementId") REFERENCES "stock_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

