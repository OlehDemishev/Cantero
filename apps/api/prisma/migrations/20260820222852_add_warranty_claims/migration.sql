-- CreateEnum
CREATE TYPE "WarrantyClaimStatus" AS ENUM ('open', 'in_progress', 'resolved', 'denied');

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "handoverDate" TIMESTAMP(3),
ADD COLUMN     "warrantyMonths" INTEGER;

-- CreateTable
CREATE TABLE "warranty_claims" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "status" "WarrantyClaimStatus" NOT NULL DEFAULT 'open',
    "submittedByClientId" TEXT,
    "submittedByUserId" TEXT,
    "submittedByName" TEXT NOT NULL,
    "assigneeWorkerId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,
    "resolvedByName" TEXT,
    "resolutionNotes" TEXT,
    "deniedAt" TIMESTAMP(3),
    "deniedByUserId" TEXT,
    "deniedByName" TEXT,
    "denialReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warranty_claims_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "warranty_claims_projectId_idx" ON "warranty_claims"("projectId");

-- CreateIndex
CREATE INDEX "warranty_claims_companyId_idx" ON "warranty_claims"("companyId");

-- AddForeignKey
ALTER TABLE "warranty_claims" ADD CONSTRAINT "warranty_claims_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_claims" ADD CONSTRAINT "warranty_claims_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_claims" ADD CONSTRAINT "warranty_claims_submittedByClientId_fkey" FOREIGN KEY ("submittedByClientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_claims" ADD CONSTRAINT "warranty_claims_assigneeWorkerId_fkey" FOREIGN KEY ("assigneeWorkerId") REFERENCES "workers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
