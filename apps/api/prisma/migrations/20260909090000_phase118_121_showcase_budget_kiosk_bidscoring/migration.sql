-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "budgetAlertThresholdPercent" INTEGER NOT NULL DEFAULT 90;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "budgetAlertThresholdPercent" INTEGER;

-- AlterTable
ALTER TABLE "workers" ADD COLUMN     "clockInPinHash" TEXT;

-- CreateTable
CREATE TABLE "bid_score_criteria" (
    "id" TEXT NOT NULL,
    "bidRequestId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "weight" INTEGER NOT NULL,

    CONSTRAINT "bid_score_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bid_scores" (
    "id" TEXT NOT NULL,
    "bidId" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,

    CONSTRAINT "bid_scores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bid_score_criteria_bidRequestId_idx" ON "bid_score_criteria"("bidRequestId");

-- CreateIndex
CREATE INDEX "bid_scores_bidId_idx" ON "bid_scores"("bidId");

-- CreateIndex
CREATE INDEX "bid_scores_criterionId_idx" ON "bid_scores"("criterionId");

-- CreateIndex
CREATE UNIQUE INDEX "bid_scores_bidId_criterionId_key" ON "bid_scores"("bidId", "criterionId");

-- AddForeignKey
ALTER TABLE "bid_score_criteria" ADD CONSTRAINT "bid_score_criteria_bidRequestId_fkey" FOREIGN KEY ("bidRequestId") REFERENCES "bid_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bid_scores" ADD CONSTRAINT "bid_scores_bidId_fkey" FOREIGN KEY ("bidId") REFERENCES "bids"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bid_scores" ADD CONSTRAINT "bid_scores_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "bid_score_criteria"("id") ON DELETE CASCADE ON UPDATE CASCADE;

