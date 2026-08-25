-- CreateEnum
CREATE TYPE "TimeOffType" AS ENUM ('vacation', 'sick', 'unpaid');

-- CreateEnum
CREATE TYPE "TimeOffStatus" AS ENUM ('pending', 'approved', 'denied');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocumentCategory" ADD VALUE 'gallery_before';
ALTER TYPE "DocumentCategory" ADD VALUE 'gallery_after';

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "referredByClientId" TEXT;

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "franchiseLinkCode" TEXT,
ADD COLUMN     "parentCompanyId" TEXT,
ADD COLUMN     "reviewRequestUrl" TEXT;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "reviewRequestedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "time_off_requests" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "type" "TimeOffType" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "status" "TimeOffStatus" NOT NULL DEFAULT 'pending',
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "time_off_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "time_off_requests_companyId_idx" ON "time_off_requests"("companyId");

-- CreateIndex
CREATE INDEX "time_off_requests_workerId_idx" ON "time_off_requests"("workerId");

-- CreateIndex
CREATE INDEX "clients_referredByClientId_idx" ON "clients"("referredByClientId");

-- CreateIndex
CREATE UNIQUE INDEX "companies_franchiseLinkCode_key" ON "companies"("franchiseLinkCode");

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_parentCompanyId_fkey" FOREIGN KEY ("parentCompanyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_off_requests" ADD CONSTRAINT "time_off_requests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_off_requests" ADD CONSTRAINT "time_off_requests_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "workers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_referredByClientId_fkey" FOREIGN KEY ("referredByClientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

