-- CreateEnum
CREATE TYPE "GreenCertificationType" AS ENUM ('leed_certified', 'leed_silver', 'leed_gold', 'leed_platinum', 'breeam', 'well', 'energy_star', 'other');

-- AlterTable
ALTER TABLE "material_catalog_items" ADD COLUMN     "carbonFootprintKgCo2e" DECIMAL(12,4),
ADD COLUMN     "greenCertificationBody" TEXT,
ADD COLUMN     "greenCertified" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "project_green_certifications" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "GreenCertificationType" NOT NULL,
    "name" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_green_certifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_green_certifications_companyId_idx" ON "project_green_certifications"("companyId");

-- CreateIndex
CREATE INDEX "project_green_certifications_projectId_idx" ON "project_green_certifications"("projectId");

-- AddForeignKey
ALTER TABLE "project_green_certifications" ADD CONSTRAINT "project_green_certifications_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_green_certifications" ADD CONSTRAINT "project_green_certifications_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
