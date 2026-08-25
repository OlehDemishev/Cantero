-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "publicLeadFormToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "companies_publicLeadFormToken_key" ON "companies"("publicLeadFormToken");
