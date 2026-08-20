-- AlterEnum
ALTER TYPE "EstimateStatus" ADD VALUE 'pending_approval';

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "approvalThresholdAmount" DECIMAL(14,2),
ADD COLUMN     "requiredApprovalCount" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "estimate_approvals" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "estimate_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "estimate_approvals_estimateId_idx" ON "estimate_approvals"("estimateId");

-- CreateIndex
CREATE UNIQUE INDEX "estimate_approvals_estimateId_userId_key" ON "estimate_approvals"("estimateId", "userId");

-- AddForeignKey
ALTER TABLE "estimate_approvals" ADD CONSTRAINT "estimate_approvals_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "estimates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
