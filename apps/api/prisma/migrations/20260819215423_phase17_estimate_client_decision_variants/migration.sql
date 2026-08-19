-- CreateEnum
CREATE TYPE "EstimateClientDecision" AS ENUM ('pending', 'approved', 'rejected');

-- AlterTable
ALTER TABLE "estimates" ADD COLUMN     "clientAccessToken" TEXT,
ADD COLUMN     "clientDecision" "EstimateClientDecision" NOT NULL DEFAULT 'pending',
ADD COLUMN     "clientDecisionNote" TEXT,
ADD COLUMN     "decisionAt" TIMESTAMP(3),
ADD COLUMN     "sentAt" TIMESTAMP(3),
ADD COLUMN     "variantLabel" TEXT,
ADD COLUMN     "variantOfId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "estimates_clientAccessToken_key" ON "estimates"("clientAccessToken");

-- CreateIndex
CREATE INDEX "estimates_variantOfId_idx" ON "estimates"("variantOfId");

-- AddForeignKey
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_variantOfId_fkey" FOREIGN KEY ("variantOfId") REFERENCES "estimates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
