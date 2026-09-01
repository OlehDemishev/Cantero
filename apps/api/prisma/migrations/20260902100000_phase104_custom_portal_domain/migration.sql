-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "customPortalDomain" TEXT,
ADD COLUMN     "customPortalDomainVerifiedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "companies_customPortalDomain_key" ON "companies"("customPortalDomain");
