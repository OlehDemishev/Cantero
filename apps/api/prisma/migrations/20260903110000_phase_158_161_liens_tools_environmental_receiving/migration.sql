-- CreateEnum
CREATE TYPE "ReceivingDiscrepancyType" AS ENUM ('short_ship', 'over_ship', 'damaged', 'backorder');

-- CreateEnum
CREATE TYPE "ReceivingDiscrepancyResolution" AS ENUM ('pending', 'credit_issued', 'replacement_sent', 'disputed');

-- CreateEnum
CREATE TYPE "LienNoticeDirection" AS ENUM ('sent', 'received');

-- CreateEnum
CREATE TYPE "LienNoticeType" AS ENUM ('preliminary_notice', 'notice_to_owner', 'notice_of_furnishing', 'other');

-- CreateEnum
CREATE TYPE "LienFilingStatus" AS ENUM ('filed', 'released', 'disputed');

-- CreateEnum
CREATE TYPE "ToolCheckoutCondition" AS ENUM ('good', 'damaged', 'lost');

-- CreateEnum
CREATE TYPE "BmpInspectionResult" AS ENUM ('satisfactory', 'deficient');

-- CreateEnum
CREATE TYPE "EnvironmentalIncidentSeverity" AS ENUM ('minor', 'moderate', 'major');

-- CreateEnum
CREATE TYPE "EnvironmentalIncidentStatus" AS ENUM ('open', 'contained', 'resolved');

-- AlterEnum
ALTER TYPE "PurchaseOrderStatus" ADD VALUE 'partially_received';

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "receivingDiscrepancyId" TEXT;

-- AlterTable
ALTER TABLE "purchase_order_lines" ADD COLUMN     "quantityReceived" DECIMAL(14,4) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "receiving_discrepancies" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "purchaseOrderLineId" TEXT NOT NULL,
    "type" "ReceivingDiscrepancyType" NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "resolution" "ReceivingDiscrepancyResolution" NOT NULL DEFAULT 'pending',
    "resolutionNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receiving_discrepancies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lien_notices" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "direction" "LienNoticeDirection" NOT NULL,
    "type" "LienNoticeType" NOT NULL DEFAULT 'preliminary_notice',
    "relatedPartyName" TEXT NOT NULL,
    "firstFurnishDate" TIMESTAMP(3),
    "deadlineDate" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "methodOfService" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lien_notices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mechanics_lien_filings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "filedByName" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "filedAt" TIMESTAMP(3) NOT NULL,
    "status" "LienFilingStatus" NOT NULL DEFAULT 'filed',
    "releasedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mechanics_lien_filings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tool_crib_items" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "barcode" TEXT,
    "replacementCost" DECIMAL(10,2),
    "parLevel" INTEGER,
    "quantityOnHand" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tool_crib_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tool_checkouts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "projectId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "checkedOutAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returnedAt" TIMESTAMP(3),
    "returnCondition" "ToolCheckoutCondition",
    "chargeAmount" DECIMAL(10,2),
    "notes" TEXT,

    CONSTRAINT "tool_checkouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stormwater_permits" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "permitNumber" TEXT,
    "noiFiledAt" TIMESTAMP(3),
    "notFiledAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stormwater_permits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bmp_inspections" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "permitId" TEXT NOT NULL,
    "inspectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "triggerReason" TEXT,
    "result" "BmpInspectionResult" NOT NULL,
    "inspectorName" TEXT,
    "correctiveActions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bmp_inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "environmental_incidents" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "EnvironmentalIncidentSeverity" NOT NULL DEFAULT 'minor',
    "status" "EnvironmentalIncidentStatus" NOT NULL DEFAULT 'open',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "containedAt" TIMESTAMP(3),
    "regulatorNotified" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "environmental_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "receiving_discrepancies_companyId_idx" ON "receiving_discrepancies"("companyId");

-- CreateIndex
CREATE INDEX "receiving_discrepancies_purchaseOrderId_idx" ON "receiving_discrepancies"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "receiving_discrepancies_purchaseOrderLineId_idx" ON "receiving_discrepancies"("purchaseOrderLineId");

-- CreateIndex
CREATE INDEX "lien_notices_companyId_idx" ON "lien_notices"("companyId");

-- CreateIndex
CREATE INDEX "lien_notices_projectId_idx" ON "lien_notices"("projectId");

-- CreateIndex
CREATE INDEX "mechanics_lien_filings_companyId_idx" ON "mechanics_lien_filings"("companyId");

-- CreateIndex
CREATE INDEX "mechanics_lien_filings_projectId_idx" ON "mechanics_lien_filings"("projectId");

-- CreateIndex
CREATE INDEX "tool_crib_items_companyId_idx" ON "tool_crib_items"("companyId");

-- CreateIndex
CREATE INDEX "tool_checkouts_companyId_idx" ON "tool_checkouts"("companyId");

-- CreateIndex
CREATE INDEX "tool_checkouts_itemId_idx" ON "tool_checkouts"("itemId");

-- CreateIndex
CREATE INDEX "tool_checkouts_workerId_idx" ON "tool_checkouts"("workerId");

-- CreateIndex
CREATE INDEX "tool_checkouts_projectId_idx" ON "tool_checkouts"("projectId");

-- CreateIndex
CREATE INDEX "stormwater_permits_companyId_idx" ON "stormwater_permits"("companyId");

-- CreateIndex
CREATE INDEX "stormwater_permits_projectId_idx" ON "stormwater_permits"("projectId");

-- CreateIndex
CREATE INDEX "bmp_inspections_companyId_idx" ON "bmp_inspections"("companyId");

-- CreateIndex
CREATE INDEX "bmp_inspections_permitId_idx" ON "bmp_inspections"("permitId");

-- CreateIndex
CREATE INDEX "environmental_incidents_companyId_idx" ON "environmental_incidents"("companyId");

-- CreateIndex
CREATE INDEX "environmental_incidents_projectId_idx" ON "environmental_incidents"("projectId");

-- CreateIndex
CREATE INDEX "documents_receivingDiscrepancyId_idx" ON "documents"("receivingDiscrepancyId");

-- AddForeignKey
ALTER TABLE "receiving_discrepancies" ADD CONSTRAINT "receiving_discrepancies_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receiving_discrepancies" ADD CONSTRAINT "receiving_discrepancies_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receiving_discrepancies" ADD CONSTRAINT "receiving_discrepancies_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "purchase_order_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lien_notices" ADD CONSTRAINT "lien_notices_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lien_notices" ADD CONSTRAINT "lien_notices_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mechanics_lien_filings" ADD CONSTRAINT "mechanics_lien_filings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mechanics_lien_filings" ADD CONSTRAINT "mechanics_lien_filings_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_receivingDiscrepancyId_fkey" FOREIGN KEY ("receivingDiscrepancyId") REFERENCES "receiving_discrepancies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_crib_items" ADD CONSTRAINT "tool_crib_items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_checkouts" ADD CONSTRAINT "tool_checkouts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_checkouts" ADD CONSTRAINT "tool_checkouts_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "tool_crib_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_checkouts" ADD CONSTRAINT "tool_checkouts_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "workers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_checkouts" ADD CONSTRAINT "tool_checkouts_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stormwater_permits" ADD CONSTRAINT "stormwater_permits_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stormwater_permits" ADD CONSTRAINT "stormwater_permits_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bmp_inspections" ADD CONSTRAINT "bmp_inspections_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bmp_inspections" ADD CONSTRAINT "bmp_inspections_permitId_fkey" FOREIGN KEY ("permitId") REFERENCES "stormwater_permits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "environmental_incidents" ADD CONSTRAINT "environmental_incidents_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "environmental_incidents" ADD CONSTRAINT "environmental_incidents_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

