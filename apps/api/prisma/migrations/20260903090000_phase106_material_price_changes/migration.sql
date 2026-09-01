-- CreateTable
CREATE TABLE "material_price_changes" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "materialCatalogItemId" TEXT NOT NULL,
    "oldPrice" DECIMAL(12,4) NOT NULL,
    "newPrice" DECIMAL(12,4) NOT NULL,
    "changePercent" DECIMAL(6,2) NOT NULL,
    "changedByUserId" TEXT,
    "changedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_price_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "material_price_changes_companyId_idx" ON "material_price_changes"("companyId");

-- CreateIndex
CREATE INDEX "material_price_changes_materialCatalogItemId_idx" ON "material_price_changes"("materialCatalogItemId");

-- AddForeignKey
ALTER TABLE "material_price_changes" ADD CONSTRAINT "material_price_changes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_price_changes" ADD CONSTRAINT "material_price_changes_materialCatalogItemId_fkey" FOREIGN KEY ("materialCatalogItemId") REFERENCES "material_catalog_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
