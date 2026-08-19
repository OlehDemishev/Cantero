-- AlterTable
ALTER TABLE "estimates" ADD COLUMN     "currentVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "isTemplate" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "projectId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "estimate_revisions" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "laborRatePerHour" DECIMAL(10,2) NOT NULL,
    "markupPercent" DECIMAL(5,2) NOT NULL,
    "taxPercent" DECIMAL(5,2) NOT NULL,
    "materialsCostTotal" DECIMAL(14,2) NOT NULL,
    "laborCostTotal" DECIMAL(14,2) NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "markupAmount" DECIMAL(14,2) NOT NULL,
    "taxAmount" DECIMAL(14,2) NOT NULL,
    "grandTotal" DECIMAL(14,2) NOT NULL,
    "lines" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "estimate_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "estimate_revisions_estimateId_idx" ON "estimate_revisions"("estimateId");

-- AddForeignKey
ALTER TABLE "estimate_revisions" ADD CONSTRAINT "estimate_revisions_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "estimates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
