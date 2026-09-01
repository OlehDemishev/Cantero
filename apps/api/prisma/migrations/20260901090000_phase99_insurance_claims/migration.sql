-- CreateEnum
CREATE TYPE "InsuranceClaimType" AS ENUM ('general_liability', 'workers_comp', 'property', 'auto', 'equipment', 'other');

-- CreateEnum
CREATE TYPE "InsuranceClaimStatus" AS ENUM ('filed', 'under_review', 'approved', 'denied', 'settled', 'closed');

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "insuranceClaimId" TEXT;

-- CreateTable
CREATE TABLE "insurance_claims" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT,
    "incidentReportId" TEXT,
    "claimType" "InsuranceClaimType" NOT NULL,
    "status" "InsuranceClaimStatus" NOT NULL DEFAULT 'filed',
    "claimNumber" TEXT,
    "insurerName" TEXT NOT NULL,
    "policyNumber" TEXT,
    "dateFiled" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "adjusterName" TEXT,
    "adjusterContact" TEXT,
    "claimAmount" DECIMAL(14,2),
    "settledAmount" DECIMAL(14,2),
    "settledAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdByUserId" TEXT,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "insurance_claims_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "insurance_claims_companyId_idx" ON "insurance_claims"("companyId");

-- CreateIndex
CREATE INDEX "insurance_claims_projectId_idx" ON "insurance_claims"("projectId");

-- CreateIndex
CREATE INDEX "insurance_claims_incidentReportId_idx" ON "insurance_claims"("incidentReportId");

-- CreateIndex
CREATE INDEX "documents_insuranceClaimId_idx" ON "documents"("insuranceClaimId");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_insuranceClaimId_fkey" FOREIGN KEY ("insuranceClaimId") REFERENCES "insurance_claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_claims" ADD CONSTRAINT "insurance_claims_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_claims" ADD CONSTRAINT "insurance_claims_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_claims" ADD CONSTRAINT "insurance_claims_incidentReportId_fkey" FOREIGN KEY ("incidentReportId") REFERENCES "incident_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;
