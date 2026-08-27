-- CreateEnum
CREATE TYPE "TakeoffMeasurementType" AS ENUM ('length', 'area');

-- AlterTable
ALTER TABLE "rate_catalog_items" ADD COLUMN     "catalogId" TEXT,
ADD COLUMN     "formula" TEXT,
ADD COLUMN     "formulaParams" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "catalogs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_catalog_item_revisions" (
    "id" TEXT NOT NULL,
    "rateCatalogItemId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "laborHoursPerUnit" DECIMAL(10,4) NOT NULL,
    "changedByUserId" TEXT,
    "changedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_catalog_item_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "takeoffs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imageStorageKey" TEXT NOT NULL,
    "scalePixelLength" DECIMAL(12,4),
    "scaleRealLength" DECIMAL(12,4),
    "scaleUnit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "takeoffs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "takeoff_measurements" (
    "id" TEXT NOT NULL,
    "takeoffId" TEXT NOT NULL,
    "type" "TakeoffMeasurementType" NOT NULL,
    "label" TEXT NOT NULL,
    "points" JSONB NOT NULL,
    "value" DECIMAL(14,4) NOT NULL,
    "unit" TEXT NOT NULL,
    "rateCatalogItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "takeoff_measurements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "catalogs_companyId_idx" ON "catalogs"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "catalogs_companyId_name_key" ON "catalogs"("companyId", "name");

-- CreateIndex
CREATE INDEX "rate_catalog_item_revisions_rateCatalogItemId_idx" ON "rate_catalog_item_revisions"("rateCatalogItemId");

-- CreateIndex
CREATE INDEX "takeoffs_companyId_idx" ON "takeoffs"("companyId");

-- CreateIndex
CREATE INDEX "takeoffs_projectId_idx" ON "takeoffs"("projectId");

-- CreateIndex
CREATE INDEX "takeoff_measurements_takeoffId_idx" ON "takeoff_measurements"("takeoffId");

-- CreateIndex
CREATE INDEX "rate_catalog_items_catalogId_idx" ON "rate_catalog_items"("catalogId");

-- AddForeignKey
ALTER TABLE "catalogs" ADD CONSTRAINT "catalogs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_catalog_items" ADD CONSTRAINT "rate_catalog_items_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "catalogs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_catalog_item_revisions" ADD CONSTRAINT "rate_catalog_item_revisions_rateCatalogItemId_fkey" FOREIGN KEY ("rateCatalogItemId") REFERENCES "rate_catalog_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "takeoffs" ADD CONSTRAINT "takeoffs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "takeoffs" ADD CONSTRAINT "takeoffs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "takeoff_measurements" ADD CONSTRAINT "takeoff_measurements_takeoffId_fkey" FOREIGN KEY ("takeoffId") REFERENCES "takeoffs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "takeoff_measurements" ADD CONSTRAINT "takeoff_measurements_rateCatalogItemId_fkey" FOREIGN KEY ("rateCatalogItemId") REFERENCES "rate_catalog_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

