-- CreateEnum
CREATE TYPE "MarkupCostType" AS ENUM ('materials', 'labor');

-- CreateEnum
CREATE TYPE "TransmittalMethod" AS ENUM ('email', 'mail', 'hand_delivery', 'courier', 'portal');

-- AlterTable
ALTER TABLE "change_orders" ADD COLUMN     "scheduleImpactDays" INTEGER;

-- AlterTable
ALTER TABLE "material_catalog_items" ADD COLUMN     "barcode" TEXT;

-- AlterTable
ALTER TABLE "stock_levels" ADD COLUMN     "binLocation" TEXT;

-- CreateTable
CREATE TABLE "markup_rules" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "costType" "MarkupCostType" NOT NULL,
    "markupPercent" DECIMAL(5,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "markup_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transmittals" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "recipientName" TEXT NOT NULL,
    "recipientCompany" TEXT,
    "method" "TransmittalMethod" NOT NULL DEFAULT 'email',
    "purpose" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedByName" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transmittals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transmittal_items" (
    "id" TEXT NOT NULL,
    "transmittalId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "transmittal_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "markup_rules_companyId_idx" ON "markup_rules"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "markup_rules_companyId_costType_key" ON "markup_rules"("companyId", "costType");

-- CreateIndex
CREATE INDEX "transmittals_companyId_idx" ON "transmittals"("companyId");

-- CreateIndex
CREATE INDEX "transmittals_projectId_idx" ON "transmittals"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "transmittals_projectId_number_key" ON "transmittals"("projectId", "number");

-- CreateIndex
CREATE INDEX "transmittal_items_transmittalId_idx" ON "transmittal_items"("transmittalId");

-- CreateIndex
CREATE UNIQUE INDEX "material_catalog_items_companyId_barcode_key" ON "material_catalog_items"("companyId", "barcode");

-- AddForeignKey
ALTER TABLE "markup_rules" ADD CONSTRAINT "markup_rules_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transmittals" ADD CONSTRAINT "transmittals_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transmittals" ADD CONSTRAINT "transmittals_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transmittal_items" ADD CONSTRAINT "transmittal_items_transmittalId_fkey" FOREIGN KEY ("transmittalId") REFERENCES "transmittals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

