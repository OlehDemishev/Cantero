-- CreateTable
CREATE TABLE "stock_kits" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kitMaterialCatalogItemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_kits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_kit_components" (
    "id" TEXT NOT NULL,
    "stockKitId" TEXT NOT NULL,
    "materialCatalogItemId" TEXT NOT NULL,
    "quantityPerKit" DECIMAL(12,6) NOT NULL,

    CONSTRAINT "stock_kit_components_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stock_kits_kitMaterialCatalogItemId_key" ON "stock_kits"("kitMaterialCatalogItemId");

-- CreateIndex
CREATE INDEX "stock_kits_companyId_idx" ON "stock_kits"("companyId");

-- CreateIndex
CREATE INDEX "stock_kit_components_stockKitId_idx" ON "stock_kit_components"("stockKitId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_kit_components_stockKitId_materialCatalogItemId_key" ON "stock_kit_components"("stockKitId", "materialCatalogItemId");

-- AddForeignKey
ALTER TABLE "stock_kits" ADD CONSTRAINT "stock_kits_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_kits" ADD CONSTRAINT "stock_kits_kitMaterialCatalogItemId_fkey" FOREIGN KEY ("kitMaterialCatalogItemId") REFERENCES "material_catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_kit_components" ADD CONSTRAINT "stock_kit_components_stockKitId_fkey" FOREIGN KEY ("stockKitId") REFERENCES "stock_kits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_kit_components" ADD CONSTRAINT "stock_kit_components_materialCatalogItemId_fkey" FOREIGN KEY ("materialCatalogItemId") REFERENCES "material_catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

