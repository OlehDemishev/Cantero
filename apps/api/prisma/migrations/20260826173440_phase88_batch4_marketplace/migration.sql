-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "referralCode" TEXT,
ADD COLUMN     "referredByCompanyId" TEXT;

-- AlterTable
ALTER TABLE "subcontractors" ADD COLUMN     "bio" TEXT,
ADD COLUMN     "publicListed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "publicToken" TEXT,
ADD COLUMN     "specialization" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "companies_referralCode_key" ON "companies"("referralCode");

-- CreateIndex
CREATE UNIQUE INDEX "subcontractors_publicToken_key" ON "subcontractors"("publicToken");

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_referredByCompanyId_fkey" FOREIGN KEY ("referredByCompanyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

