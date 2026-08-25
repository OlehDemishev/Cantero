-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "ssoCert" TEXT,
ADD COLUMN     "ssoDomain" TEXT,
ADD COLUMN     "ssoEntryPoint" TEXT,
ADD COLUMN     "ssoIssuer" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "companies_ssoDomain_key" ON "companies"("ssoDomain");
