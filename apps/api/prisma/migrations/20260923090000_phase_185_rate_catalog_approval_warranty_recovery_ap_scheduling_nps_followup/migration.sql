-- CreateEnum
CREATE TYPE "RateCatalogPendingChangeStatus" AS ENUM ('pending', 'approved', 'rejected');

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "npsDetractorFollowUpEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rateCatalogApprovalThresholdPercent" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "subcontractor_backcharges" ADD COLUMN     "warrantyClaimId" TEXT;

-- AlterTable
ALTER TABLE "vendor_bills" ADD COLUMN     "scheduledPaymentDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "warranty_claims" ADD COLUMN     "repairCost" DECIMAL(14,2);

-- CreateTable
CREATE TABLE "rate_catalog_item_pending_changes" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "rateCatalogItemId" TEXT NOT NULL,
    "name" TEXT,
    "unit" TEXT,
    "laborHoursPerUnit" DECIMAL(10,4),
    "catalogId" TEXT,
    "formula" TEXT,
    "formulaParams" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "RateCatalogPendingChangeStatus" NOT NULL DEFAULT 'pending',
    "proposedByUserId" TEXT,
    "proposedByName" TEXT NOT NULL,
    "proposedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedByUserId" TEXT,
    "decidedByName" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,

    CONSTRAINT "rate_catalog_item_pending_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rate_catalog_item_pending_changes_companyId_idx" ON "rate_catalog_item_pending_changes"("companyId");

-- CreateIndex
CREATE INDEX "rate_catalog_item_pending_changes_rateCatalogItemId_idx" ON "rate_catalog_item_pending_changes"("rateCatalogItemId");

-- CreateIndex
CREATE INDEX "subcontractor_backcharges_warrantyClaimId_idx" ON "subcontractor_backcharges"("warrantyClaimId");

-- AddForeignKey
ALTER TABLE "rate_catalog_item_pending_changes" ADD CONSTRAINT "rate_catalog_item_pending_changes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_catalog_item_pending_changes" ADD CONSTRAINT "rate_catalog_item_pending_changes_rateCatalogItemId_fkey" FOREIGN KEY ("rateCatalogItemId") REFERENCES "rate_catalog_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontractor_backcharges" ADD CONSTRAINT "subcontractor_backcharges_warrantyClaimId_fkey" FOREIGN KEY ("warrantyClaimId") REFERENCES "warranty_claims"("id") ON DELETE SET NULL ON UPDATE CASCADE;

