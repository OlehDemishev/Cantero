-- CreateEnum
CREATE TYPE "LienWaiverType" AS ENUM ('conditional_progress', 'unconditional_progress', 'conditional_final', 'unconditional_final');

-- CreateTable
CREATE TABLE "lien_waivers" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "subcontractorId" TEXT NOT NULL,
    "subcontractorCostId" TEXT NOT NULL,
    "type" "LienWaiverType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signedAt" TIMESTAMP(3),
    "signerName" TEXT,
    "signatureImageKey" TEXT,
    "signedIp" TEXT,

    CONSTRAINT "lien_waivers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lien_waivers_subcontractorCostId_key" ON "lien_waivers"("subcontractorCostId");

-- CreateIndex
CREATE INDEX "lien_waivers_companyId_idx" ON "lien_waivers"("companyId");

-- CreateIndex
CREATE INDEX "lien_waivers_subcontractorId_idx" ON "lien_waivers"("subcontractorId");

-- AddForeignKey
ALTER TABLE "lien_waivers" ADD CONSTRAINT "lien_waivers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lien_waivers" ADD CONSTRAINT "lien_waivers_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lien_waivers" ADD CONSTRAINT "lien_waivers_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "subcontractors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lien_waivers" ADD CONSTRAINT "lien_waivers_subcontractorCostId_fkey" FOREIGN KEY ("subcontractorCostId") REFERENCES "subcontractor_costs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
